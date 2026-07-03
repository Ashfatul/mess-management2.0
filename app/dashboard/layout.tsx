"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<any>(null);
  const [mess, setMess] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuthAndFetchProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      // Fetch user profile
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (profileError || !profileData) {
        // Auto-recover missing profile record
        const { data: recoveredProfile, error: recoverError } = await supabase
          .from("profiles")
          .insert({
            id: session.user.id,
            email: session.user.email || "",
            full_name: "Admin User",
            role: "super_admin",
          })
          .select()
          .single();

        if (!recoverError && recoveredProfile) {
          setProfile(recoveredProfile);
          router.push("/signup"); // Redirect to recreate mess name
          return;
        } else {
          // Clean up bad session state and force redirect to login
          await supabase.auth.signOut();
          router.push("/login");
          return;
        }
      } else {
        setProfile(profileData);
        if (!profileData.mess_id) {
          router.push("/signup");
          return;
        }
      }

      // If user belongs to a mess, fetch mess details
      if (profileData?.mess_id) {
        const { data: messData } = await supabase
          .from("messes")
          .select("*")
          .eq("id", profileData.mess_id)
          .single();
        setMess(messData);
      }

      setLoading(false);
    };

    checkAuthAndFetchProfile();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center bg-zinc-950 text-zinc-50 min-h-screen">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-zinc-400 text-sm">Loading your dashboard...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center bg-zinc-950 text-zinc-50 min-h-screen px-6 text-center">
        <h2 className="text-xl font-bold mb-2">Profile Not Found</h2>
        <p className="text-zinc-400 text-sm mb-6">We could not load your user profile details.</p>
        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-indigo-600 rounded-lg text-sm hover:bg-indigo-500 transition-colors"
        >
          Sign Out & Return Home
        </button>
      </div>
    );
  }

  // If user has no mess_id, prompt them to create or join one
  if (!profile.mess_id) {
    return <MessSetupScreen profile={profile} onLogout={handleLogout} />;
  }

  const navLinks = [
    { name: "Summary", href: "/dashboard", icon: "📊" },
    { name: "Meal Log", href: "/dashboard/meals", icon: "🍽️" },
    { name: "Bazar & Costs", href: "/dashboard/costs", icon: "🛒" },
    ...(mess?.deposit_mode !== "pay_as_you_go"
      ? [{ name: "Deposits", href: "/dashboard/deposits", icon: "💵" }]
      : []),
    { name: "Members", href: "/dashboard/members", icon: "👥" },
    { name: "Settings", href: "/dashboard/settings", icon: "⚙️" },
  ];

  return (
    <div className="fixed inset-0 flex flex-col md:flex-row bg-zinc-950 text-zinc-50 overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 border-r border-zinc-800 bg-zinc-900/50 backdrop-blur flex flex-col shrink-0">
        {/* Header Branding */}
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-lg text-white">
              M
            </div>
            <div>
              <h2 className="font-semibold text-sm leading-tight text-white">{mess?.name || "My Mess"}</h2>
              <span className="text-[10px] text-indigo-400 font-medium tracking-wide uppercase">
                {profile.role === "super_admin" ? "Super Admin" : "Member"}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.name}
                href={link.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/10"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
                }`}
              >
                <span>{link.icon}</span>
                {link.name}
              </Link>
            );
          })}
        </nav>

        {/* User profile footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950/40 flex items-center justify-between shrink-0">
          <div className="truncate pr-2">
            <p className="text-xs font-semibold text-zinc-200 truncate">{profile.full_name || "User"}</p>
            <p className="text-[10px] text-zinc-500 truncate">{profile.email}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Log Out"
            className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800/40 transition-colors"
          >
            🚪
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-y-auto h-full">
        {children}
      </main>
    </div>
  );
}

// Sub-screen shown if user has no mess assigned
function MessSetupScreen({ profile, onLogout }: { profile: any; onLogout: () => void }) {
  const [messName, setMessName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleCreateMess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messName.trim()) return;
    setLoading(true);
    setErrorMsg("");

    try {
      const { data: messData, error: messError } = await supabase
        .from("messes")
        .insert({ name: messName })
        .select()
        .single();

      if (messError) throw messError;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ mess_id: messData.id, role: "super_admin" })
        .eq("id", profile.id);

      if (profileError) throw profileError;

      window.location.reload();
    } catch (err: any) {
      setErrorMsg(err.message || "Could not create mess.");
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-center items-center bg-zinc-950 text-zinc-50 min-h-screen px-6 font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-950/20 via-zinc-950 to-zinc-950 pointer-events-none" />
      <div className="w-full max-w-md bg-zinc-900/60 border border-zinc-800/80 p-8 rounded-2xl backdrop-blur-xl shadow-xl z-10">
        <h2 className="text-xl font-bold mb-2 text-white">Create or Join a Mess</h2>
        <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
          It looks like you are not part of any Mess. Create a new Mess as a Super Admin, or ask your mess manager to invite you to their mess.
        </p>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/50 border border-red-800 text-red-200 text-xs">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleCreateMess} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Create a New Mess</label>
            <input
              type="text"
              required
              value={messName}
              onChange={(e) => setMessName(e.target.value)}
              className="block w-full rounded-lg bg-zinc-950/80 border border-zinc-800 px-3 py-2 text-zinc-200 shadow-sm placeholder:text-zinc-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
              placeholder="e.g. Uttara Friends Mess"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 text-white"
          >
            {loading ? "Creating..." : "Create New Mess"}
          </button>
        </form>

        <div className="border-t border-zinc-800/60 my-6" />

        <button
          onClick={onLogout}
          className="w-full py-2 border border-zinc-800 hover:bg-zinc-800/50 rounded-lg text-sm text-zinc-400 hover:text-white transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="flex-1 flex flex-col justify-center items-center bg-zinc-950 text-zinc-50 min-h-screen">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-zinc-400 text-sm">Initializing...</p>
      </div>
    }>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </Suspense>
  );
}
