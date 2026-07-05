-- Clean up existing database objects to allow clean re-runs
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS get_my_mess_id() CASCADE;
DROP FUNCTION IF EXISTS is_super_admin() CASCADE;

DROP TABLE IF EXISTS costs CASCADE;
DROP TABLE IF EXISTS deposits CASCADE;
DROP TABLE IF EXISTS meals CASCADE;
DROP TABLE IF EXISTS invites CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS messes CASCADE;

-- Create a table for Messes
CREATE TABLE messes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    meal_entry_rule TEXT CHECK (meal_entry_rule IN ('anyone', 'admin_only', 'member_self_only')) NOT NULL DEFAULT 'anyone',
    deposit_mode TEXT CHECK (deposit_mode IN ('prepaid', 'pay_as_you_go')) NOT NULL DEFAULT 'prepaid',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on messes
ALTER TABLE messes ENABLE ROW LEVEL SECURITY;

-- Create profiles table (ID matches Supabase Auth, but without foreign key checks to allow seeding mock profiles)
CREATE TABLE profiles (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role TEXT CHECK (role IN ('super_admin', 'member')) NOT NULL DEFAULT 'member',
    mess_id UUID REFERENCES messes(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Security definer helper function to get current user's mess_id without triggering select policy recursion
CREATE OR REPLACE FUNCTION get_my_mess_id()
RETURNS UUID AS $$
    SELECT mess_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Security definer helper function to check if current user is super_admin without recursion
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'super_admin'
    );
$$ LANGUAGE sql SECURITY DEFINER;

-- Create table for Invites
CREATE TABLE invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    role TEXT CHECK (role IN ('super_admin', 'member')) NOT NULL DEFAULT 'member',
    mess_id UUID REFERENCES messes(id) ON DELETE CASCADE NOT NULL,
    token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
    status TEXT CHECK (status IN ('pending', 'accepted')) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on invites
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

-- Create table for Daily Meals
CREATE TABLE meals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL,
    count NUMERIC(3, 1) NOT NULL DEFAULT 0.0 CHECK (count >= 0.0),
    added_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (profile_id, date)
);

-- Enable RLS on meals
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;

-- Create table for Deposits
CREATE TABLE deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0.0),
    added_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on deposits
ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;

-- Create table for Costs (Bazar, Utilities, Global Bazar, etc.)
CREATE TABLE costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- who paid/spent it
    date DATE NOT NULL,
    cost_category TEXT CHECK (cost_category IN ('meal_bazar', 'global_bazar', 'wifi', 'gas', 'electricity', 'other')) NOT NULL,
    items TEXT, -- description of items bought
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0.0),
    shared_by JSONB, -- custom split mapping details: either array of IDs or object mapping {profile_id: amount} (NULL means shared by all)
    added_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on costs
ALTER TABLE costs ENABLE ROW LEVEL SECURITY;

-- Create table for Settlements
CREATE TABLE settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mess_id UUID REFERENCES messes(id) ON DELETE CASCADE NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    status TEXT CHECK (status IN ('pending', 'settled')) NOT NULL DEFAULT 'pending',
    settled_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    settled_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    UNIQUE (mess_id, year, month, profile_id)
);

-- Enable RLS on settlements
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

----------------------------------------------------
-- Row Level Security (RLS) Policies (Recursive-Safe Version)
----------------------------------------------------

-- Messes Policies
CREATE POLICY "Allow read mess details for members" ON messes
    FOR SELECT TO authenticated USING (
        id = get_my_mess_id() OR EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND (profiles.mess_id IS NULL OR profiles.mess_id = messes.id)
        )
    );

CREATE POLICY "Allow authenticated users to create a mess" ON messes
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow update mess details for super admin" ON messes
    FOR UPDATE TO authenticated USING (
        id = get_my_mess_id() AND is_super_admin()
    );

-- Profiles Policies
CREATE POLICY "Allow read profiles in same mess" ON profiles
    FOR SELECT TO authenticated USING (
        mess_id = get_my_mess_id()
    );

CREATE POLICY "Allow profiles self manage" ON profiles
    FOR ALL TO authenticated USING (id = auth.uid());

-- Allow Super Admin to fully manage profiles inside their own mess (includes Insert, Update and Delete)
CREATE POLICY "Allow super admin to manage profiles in same mess" ON profiles
    FOR ALL TO authenticated USING (
        mess_id = get_my_mess_id() AND is_super_admin()
    ) WITH CHECK (
        mess_id = get_my_mess_id() AND is_super_admin()
    );

-- Invites Policies
CREATE POLICY "Allow read invites for mess" ON invites
    FOR SELECT TO authenticated USING (
        mess_id = get_my_mess_id()
    );

CREATE POLICY "Allow public read of invites by token" ON invites
    FOR SELECT TO anon, authenticated USING (
        status = 'pending'
    );

CREATE POLICY "Allow create/delete invites for super admin" ON invites
    FOR ALL TO authenticated USING (
        mess_id = get_my_mess_id() AND is_super_admin()
    );

-- Meals Policies
CREATE POLICY "Allow meal read in same mess" ON meals
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE public.profiles.id = meals.profile_id AND public.profiles.mess_id = get_my_mess_id()
        )
    );

CREATE POLICY "Allow meal manage in same mess" ON meals
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE public.profiles.id = meals.profile_id AND public.profiles.mess_id = get_my_mess_id()
        )
    );

-- Deposits Policies
CREATE POLICY "Allow deposit read in same mess" ON deposits
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE public.profiles.id = deposits.profile_id AND public.profiles.mess_id = get_my_mess_id()
        )
    );

CREATE POLICY "Allow deposit manage in same mess" ON deposits
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE public.profiles.id = deposits.profile_id AND public.profiles.mess_id = get_my_mess_id()
        )
    );

-- Costs Policies
CREATE POLICY "Allow costs read in same mess" ON costs
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE public.profiles.id = auth.uid() AND public.profiles.mess_id = get_my_mess_id()
        )
    );

CREATE POLICY "Allow costs manage in same mess" ON costs
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE public.profiles.id = auth.uid() AND public.profiles.mess_id = get_my_mess_id()
        )
    );

-- Settlements Policies
CREATE POLICY "Allow read settlements for mess" ON settlements
    FOR SELECT TO authenticated USING (
        mess_id = get_my_mess_id()
    );

CREATE POLICY "Allow super admin manage settlements" ON settlements
    FOR ALL TO authenticated USING (
        mess_id = get_my_mess_id() AND is_super_admin()
    );

-- Trigger to create a profile automatically when a new user signs up in supabase auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    is_first BOOLEAN;
    mess_id_to_use UUID;
    invite_id UUID;
    invite_mess_id UUID;
    invite_role TEXT;
    input_mess_name TEXT;
BEGIN
    -- Check if this is the first user signing up
    SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first;
    
    -- Check if there is a pending invite for this email
    SELECT id, mess_id, role INTO invite_id, invite_mess_id, invite_role
    FROM public.invites
    WHERE email = NEW.email AND status = 'pending'
    LIMIT 1;

    -- Read mess name from user metadata if provided
    input_mess_name := NEW.raw_user_meta_data->>'mess_name';

    IF invite_id IS NOT NULL THEN
        -- Accept invite
        INSERT INTO public.profiles (id, email, full_name, role, mess_id)
        VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), invite_role, invite_mess_id);
        
        UPDATE public.invites
        SET status = 'accepted'
        WHERE id = invite_id;
    ELSIF input_mess_name IS NOT NULL AND input_mess_name <> '' THEN
        -- Create mess on the fly
        INSERT INTO public.messes (name)
        VALUES (input_mess_name)
        RETURNING id INTO mess_id_to_use;

        -- Create profile as super admin
        INSERT INTO public.profiles (id, email, full_name, role, mess_id)
        VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 'super_admin', mess_id_to_use);
    ELSE
        -- If first user but no mess name provided (fallback)
        IF is_first THEN
            INSERT INTO public.profiles (id, email, full_name, role, mess_id)
            VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 'super_admin', NULL);
        ELSE
            -- Regular member signup
            INSERT INTO public.profiles (id, email, full_name, role, mess_id)
            VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 'member', NULL);
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
