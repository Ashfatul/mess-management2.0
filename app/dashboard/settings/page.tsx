"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function SettingsPage() {
  const [profile, setProfile] = useState<any>(null);
  const [mess, setMess] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Settings states
  const [messName, setMessName] = useState("");
  const [mealEntryRule, setMealEntryRule] = useState("anyone");
  const [depositMode, setDepositMode] = useState("prepaid");
  const [updatingSettings, setUpdatingSettings] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState("");

  // Wipe levels of confirmation
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState("");
  const [wiping, setWiping] = useState(false);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (!profileData || !profileData.mess_id) return;
      setProfile(profileData);

      // Fetch mess
      const { data: messData } = await supabase
        .from("messes")
        .select("*")
        .eq("id", profileData.mess_id)
        .single();
      
      if (messData) {
        setMess(messData);
        setMessName(messData.name);
        setMealEntryRule(messData.meal_entry_rule || "anyone");
        setDepositMode(messData.deposit_mode || "prepaid");
      }

      setLoading(false);
    };

    init();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.mess_id || !messName.trim()) return;
    setUpdatingSettings(true);
    setSettingsStatus("");
    try {
      const { error } = await supabase
        .from("messes")
        .update({ 
          name: messName.trim(), 
          meal_entry_rule: mealEntryRule,
          deposit_mode: depositMode
        })
        .eq("id", profile.mess_id);

      if (error) throw error;

      setSettingsStatus("Settings saved successfully! Reloading...");
      
      const { data: updatedMess } = await supabase
        .from("messes")
        .select("*")
        .eq("id", profile.mess_id)
        .single();
      if (updatedMess) {
        setMess(updatedMess);
        setMessName(updatedMess.name);
        setMealEntryRule(updatedMess.meal_entry_rule || "anyone");
        setDepositMode(updatedMess.deposit_mode || "prepaid");
      }
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err: any) {
      setSettingsStatus("Error saving settings: " + err.message);
    } finally {
      setUpdatingSettings(false);
    }
  };

  // Seed Demo Data Function
  const handleSeedDemoData = async () => {
    if (!confirm("Seed demo transactions for preview? (This adds sample deposits, meals, and bazar costs for the current month)")) return;
    setUpdatingSettings(true);
    try {
      const isLocalMock = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://placeholder.supabase.co';
      
      const currentYear = new Date().getFullYear();
      const currentMonth = String(new Date().getMonth() + 1).padStart(2, "0");
      const days = new Date(currentYear, Number(currentMonth), 0).getDate();

      if (isLocalMock) {
        const rawDb = localStorage.getItem("mess_mock_db");
        if (rawDb) {
          const db = JSON.parse(rawDb);

          // Seed demo members
          const demoMembers = [
            { id: "demo-shariful", email: "shariful@demo.com", full_name: "Shariful", role: "member", mess_id: profile.mess_id },
            { id: "demo-sadman", email: "sadman@demo.com", full_name: "Sadman", role: "member", mess_id: profile.mess_id },
            { id: "demo-hamim", email: "hamim@demo.com", full_name: "Hamim", role: "member", mess_id: profile.mess_id },
            { id: "demo-mostakim", email: "mostakim@demo.com", full_name: "Mostakim", role: "member", mess_id: profile.mess_id },
            { id: "demo-fahim", email: "fahim@demo.com", full_name: "Fahim", role: "member", mess_id: profile.mess_id },
          ];

          demoMembers.forEach((dm) => {
            if (!db.profiles.find((p: any) => p.email === dm.email)) {
              db.profiles.push(dm);
            }
          });

          // Seed daily meals
          for (let d = 1; d <= days; d++) {
            const dateStr = `${currentYear}-${currentMonth}-${String(d).padStart(2, "0")}`;
            db.meals.push({ id: `meal-sh-${d}`, profile_id: "demo-shariful", date: dateStr, count: d % 3 === 0 ? 0.0 : 1.0 });
            db.meals.push({ id: `meal-sa-${d}`, profile_id: "demo-sadman", date: dateStr, count: d % 5 === 0 ? 1.5 : 1.0 });
            db.meals.push({ id: `meal-ha-${d}`, profile_id: "demo-hamim", date: dateStr, count: d % 4 === 0 ? 0.0 : 2.0 });
            db.meals.push({ id: `meal-mo-${d}`, profile_id: "demo-mostakim", date: dateStr, count: 1.0 });
            db.meals.push({ id: `meal-fa-${d}`, profile_id: "demo-fahim", date: dateStr, count: d % 2 === 0 ? 1.5 : 0.0 });
            db.meals.push({ id: `meal-me-${d}`, profile_id: profile.id, date: dateStr, count: 1.0 });
          }

          // Seed deposits
          db.deposits.push({ id: "dep-1", profile_id: profile.id, date: `${currentYear}-${currentMonth}-01`, amount: 2000.0, added_by: profile.id });
          db.deposits.push({ id: "dep-2", profile_id: "demo-shariful", date: `${currentYear}-${currentMonth}-02`, amount: 2000.0, added_by: profile.id });
          db.deposits.push({ id: "dep-3", profile_id: "demo-sadman", date: `${currentYear}-${currentMonth}-04`, amount: 2000.0, added_by: profile.id });
          db.deposits.push({ id: "dep-4", profile_id: "demo-hamim", date: `${currentYear}-${currentMonth}-06`, amount: 2500.0, added_by: profile.id });
          db.deposits.push({ id: "dep-5", profile_id: "demo-mostakim", date: `${currentYear}-${currentMonth}-08`, amount: 2000.0, added_by: profile.id });

          // Seed costs
          db.costs.push({ id: "cost-1", profile_id: "demo-shariful", date: `${currentYear}-${currentMonth}-05`, cost_category: "meal_bazar", items: "Chicken & Vegetables", amount: 1250.0 });
          db.costs.push({ id: "cost-2", profile_id: "demo-sadman", date: `${currentYear}-${currentMonth}-10`, cost_category: "meal_bazar", items: "Fish & Egg", amount: 800.0 });
          db.costs.push({ id: "cost-3", profile_id: profile.id, date: `${currentYear}-${currentMonth}-01`, cost_category: "wifi", items: "Wifi Monthly Payment", amount: 600.0 });
          db.costs.push({ id: "cost-4", profile_id: "demo-hamim", date: `${currentYear}-${currentMonth}-12`, cost_category: "electricity", items: "Electricity Bill", amount: 1500.0 });

          localStorage.setItem("mess_mock_db", JSON.stringify(db));
          alert("Demo data successfully seeded in local preview database!");
          window.location.reload();
        }
      } else {
        // Live database seeding (all members included because profiles foreign key is removed!)
        alert("Live mode active. Seeding sample deposits, meals, and costs for all members now.");
        
        const demoMembers = [
          { id: "00000000-0000-0000-0000-000000000001", email: "shariful@demo.com", full_name: "Shariful", role: "member", mess_id: profile.mess_id },
          { id: "00000000-0000-0000-0000-000000000002", email: "sadman@demo.com", full_name: "Sadman", role: "member", mess_id: profile.mess_id },
          { id: "00000000-0000-0000-0000-000000000003", email: "hamim@demo.com", full_name: "Hamim", role: "member", mess_id: profile.mess_id },
          { id: "00000000-0000-0000-0000-000000000004", email: "mostakim@demo.com", full_name: "Mostakim", role: "member", mess_id: profile.mess_id },
          { id: "00000000-0000-0000-0000-000000000005", email: "fahim@demo.com", full_name: "Fahim", role: "member", mess_id: profile.mess_id },
        ];

        // 1. Insert profiles (using upsert so it doesn't fail if they already exist)
        const { error: profileError } = await supabase.from("profiles").upsert(demoMembers, { onConflict: "id" });
        if (profileError) throw profileError;

        // 2. Seed daily meals
        const mealUpserts = [];
        for (let d = 1; d <= days; d++) {
          const dateStr = `${currentYear}-${currentMonth}-${String(d).padStart(2, "0")}`;
          mealUpserts.push({ profile_id: "00000000-0000-0000-0000-000000000001", date: dateStr, count: d % 3 === 0 ? 0.0 : 1.0, added_by: profile.id });
          mealUpserts.push({ profile_id: "00000000-0000-0000-0000-000000000002", date: dateStr, count: d % 5 === 0 ? 1.5 : 1.0, added_by: profile.id });
          mealUpserts.push({ profile_id: "00000000-0000-0000-0000-000000000003", date: dateStr, count: d % 4 === 0 ? 0.0 : 2.0, added_by: profile.id });
          mealUpserts.push({ profile_id: "00000000-0000-0000-0000-000000000004", date: dateStr, count: 1.0, added_by: profile.id });
          mealUpserts.push({ profile_id: "00000000-0000-0000-0000-000000000005", date: dateStr, count: d % 2 === 0 ? 1.5 : 0.0, added_by: profile.id });
          mealUpserts.push({ profile_id: profile.id, date: dateStr, count: 1.0, added_by: profile.id });
        }
        const { error: mealError } = await supabase.from("meals").upsert(mealUpserts, { onConflict: "profile_id, date" });
        if (mealError) throw mealError;

        // 3. Seed deposits
        const { error: depError } = await supabase.from("deposits").insert([
          { profile_id: profile.id, date: `${currentYear}-${currentMonth}-01`, amount: 2000.0, added_by: profile.id },
          { profile_id: "00000000-0000-0000-0000-000000000001", date: `${currentYear}-${currentMonth}-02`, amount: 2000.0, added_by: profile.id },
          { profile_id: "00000000-0000-0000-0000-000000000002", date: `${currentYear}-${currentMonth}-04`, amount: 2000.0, added_by: profile.id },
          { profile_id: "00000000-0000-0000-0000-000000000003", date: `${currentYear}-${currentMonth}-06`, amount: 2500.0, added_by: profile.id },
          { profile_id: "00000000-0000-0000-0000-000000000004", date: `${currentYear}-${currentMonth}-08`, amount: 2000.0, added_by: profile.id },
        ]);
        if (depError) throw depError;

        // 4. Seed costs
        const { error: costError } = await supabase.from("costs").insert([
          { profile_id: "00000000-0000-0000-0000-000000000001", date: `${currentYear}-${currentMonth}-05`, cost_category: "meal_bazar", items: "Chicken & Vegetables", amount: 1250.0, added_by: profile.id },
          { profile_id: "00000000-0000-0000-0000-000000000002", date: `${currentYear}-${currentMonth}-10`, cost_category: "meal_bazar", items: "Fish & Egg", amount: 800.0, added_by: profile.id },
          { profile_id: profile.id, date: `${currentYear}-${currentMonth}-01`, cost_category: "wifi", items: "Wifi Monthly Payment", amount: 600.0, added_by: profile.id },
          { profile_id: "00000000-0000-0000-0000-000000000003", date: `${currentYear}-${currentMonth}-12`, cost_category: "electricity", items: "Electricity Bill", amount: 1500.0, added_by: profile.id },
        ]);
        if (costError) throw costError;
        
        alert("Full multi-member sample preview data seeded successfully!");
        window.location.reload();
      }
    } catch (err: any) {
      alert("Error seeding demo data: " + err.message);
    } finally {
      setUpdatingSettings(false);
    }
  };

  // Wipe Data Handler
  const handleWipeData = async () => {
    if (!profile?.id || !profile?.mess_id) {
      alert("Error: Admin profile context is not fully loaded. Please refresh and try again.");
      return;
    }
    if (wipeConfirmText !== (mess?.name || "RESET")) {
      alert("Verification text does not match the Mess Name.");
      return;
    }
    setWiping(true);
    try {
      const isLocalMock = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://placeholder.supabase.co';
      
      if (isLocalMock) {
        const rawDb = localStorage.getItem("mess_mock_db");
        if (rawDb) {
          const db = JSON.parse(rawDb);
          db.profiles = db.profiles.filter((p: any) => p.id === profile.id);
          db.meals = [];
          db.deposits = [];
          db.costs = [];
          db.invites = [];
          localStorage.setItem("mess_mock_db", JSON.stringify(db));
        }
      } else {
        // Delete all data except current super admin from live Supabase
        // 1. Fetch all profile IDs under this mess first
        const { data: messMembers } = await supabase
          .from("profiles")
          .select("id")
          .eq("mess_id", profile.mess_id);
        
        const memberIds = messMembers?.map((m: any) => m.id) || [];
        
        if (memberIds.length > 0) {
          const { error: errorMeals } = await supabase.from("meals").delete().in("profile_id", memberIds);
          const { error: errorDeposits } = await supabase.from("deposits").delete().in("profile_id", memberIds);
          const { error: errorCosts } = await supabase.from("costs").delete().in("profile_id", memberIds);
          
          if (errorMeals || errorDeposits || errorCosts) {
            throw new Error("Failed to clear ledger entries.");
          }
        }

        // 2. Remove invites and other members
        const { error: errorInvites } = await supabase.from("invites").delete().eq("mess_id", profile.mess_id);
        const { error: errorProfiles } = await supabase.from("profiles").delete().eq("mess_id", profile.mess_id).neq("id", profile.id);
        
        if (errorInvites || errorProfiles) {
          throw new Error("Failed to remove invites or other members.");
        }
      }
      alert("Database wiped successfully! Only your Super Admin profile remains.");
      window.location.reload();
    } catch (err: any) {
      alert("Error wiping database: " + err.message);
    } finally {
      setWiping(false);
      setShowWipeModal(false);
      setWipeConfirmText("");
    }
  };

  const handleOpenWipeModal = () => {
    if (!confirm("⚠️ DANGER: You are about to wipe all mess data. This will delete all members, meal counts, deposits, and costs. Do you want to proceed?")) return;
    if (!confirm("⚠️ WARNING LEVEL 2: This action CANNOT be undone. Are you absolutely certain you want to wipe everything?")) return;
    setShowWipeModal(true);
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center bg-zinc-950 text-zinc-50 py-24 gap-4">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-300 text-sm font-medium">Loading settings panel...</p>
      </div>
    );
  }

  const isSuperAdmin = profile?.role === "super_admin";

  return (
    <div className="flex-1 bg-zinc-950 text-zinc-50 font-sans text-sm md:text-base flex flex-col h-full overflow-hidden">
      {/* Sticky Upper Action Bar */}
      <div className="sticky top-0 z-20 bg-zinc-950/80 backdrop-blur-md px-6 py-6 md:px-8 border-b border-zinc-900 shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">Mess Settings</h1>
          <p className="text-sm text-zinc-400">Configure mess profiles, access rules and database tools</p>
        </div>
      </div>

      {/* Scrollable Page Content */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left Area: Main Configuration Forms */}
          <div className="lg:col-span-2 space-y-6">
            <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 backdrop-blur space-y-6">
              <h2 className="text-base font-semibold text-zinc-200 border-b border-zinc-800 pb-3 font-sans">General Config</h2>
              
              <form onSubmit={handleSaveSettings} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1.5 font-sans">Mess Name</label>
                  <input
                    type="text"
                    required
                    disabled={!isSuperAdmin}
                    value={messName}
                    onChange={(e) => setMessName(e.target.value)}
                    className="w-full bg-zinc-950/80 border border-zinc-800 px-3.5 py-2.5 rounded-lg text-zinc-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm font-sans disabled:opacity-50"
                    placeholder="e.g. Dream Mess"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1.5 font-sans">Who is allowed to enter meal logs?</label>
                  {isSuperAdmin ? (
                    <select
                      value={mealEntryRule}
                      onChange={(e) => setMealEntryRule(e.target.value)}
                      className="w-full bg-zinc-950/80 border border-zinc-800 px-3.5 py-2.5 rounded-lg text-zinc-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm pr-10 appearance-none cursor-pointer font-sans"
                    >
                      <option value="anyone">Anyone (Add for all members)</option>
                      <option value="member_self_only">Each member logs for themselves only</option>
                      <option value="admin_only">Only Super Admins</option>
                    </select>
                  ) : (
                    <div className="px-4 py-2.5 rounded-lg bg-zinc-950 text-zinc-300 text-sm font-semibold font-sans">
                      {mealEntryRule === "admin_only" 
                        ? "🔒 Only Super Admins can log meals" 
                        : mealEntryRule === "member_self_only"
                        ? "👤 Self Logging Only (each logs their own)"
                        : "🔓 Anyone in the Mess can log meals"}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1.5 font-sans">Deposit & Contribution Model</label>
                  {isSuperAdmin ? (
                    <select
                      value={depositMode}
                      onChange={(e) => setDepositMode(e.target.value)}
                      className="w-full bg-zinc-950/80 border border-zinc-800 px-3.5 py-2.5 rounded-lg text-zinc-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm pr-10 appearance-none cursor-pointer font-sans"
                    >
                      <option value="prepaid">Prepaid (Members pay cash in advance to manager)</option>
                      <option value="pay_as_you_go">Pay-as-you-go (Direct spending automatically counts as deposit)</option>
                    </select>
                  ) : (
                    <div className="px-4 py-2.5 rounded-lg bg-zinc-950 text-zinc-300 text-sm font-semibold font-sans">
                      {depositMode === "pay_as_you_go"
                        ? "💸 Pay-as-you-go (Spending counts as deposits)"
                        : "💵 Prepaid deposits to the manager"}
                    </div>
                  )}
                </div>

                {settingsStatus && (
                  <p className={`text-xs font-sans ${settingsStatus.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}>
                    {settingsStatus}
                  </p>
                )}

                {isSuperAdmin && (
                  <button
                    type="submit"
                    disabled={updatingSettings}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-sm transition-colors shadow-md disabled:opacity-50 font-sans"
                  >
                    {updatingSettings ? "Saving Settings..." : "Save Settings"}
                  </button>
                )}
              </form>
            </div>
          </div>

          {/* Right Area: Database Tools (Only for Super Admins) */}
          {isSuperAdmin && (
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 space-y-6 backdrop-blur">
              <div>
                <h2 className="text-base font-semibold text-zinc-200 border-b border-zinc-800 pb-3 font-sans">Database Tools</h2>
                <p className="text-xs text-zinc-500 mt-2 font-sans">Utilities to control data and preview states.</p>
              </div>

              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <h4 className="text-xs font-semibold text-zinc-300 uppercase font-sans">Seed Dummy Data</h4>
                  <p className="text-xs text-zinc-500 leading-relaxed font-sans">
                    Seed the system with sample transactions, dates, members, deposits, and meal counts to quickly see how it calculates everything.
                  </p>
                  <button
                    onClick={handleSeedDemoData}
                    disabled={updatingSettings}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors shadow"
                  >
                    Seed Demo Data
                  </button>
                </div>

                <div className="border-t border-zinc-800/80 my-4" />

                <div className="space-y-1.5">
                  <h4 className="text-xs font-semibold text-red-400 uppercase font-sans">Wipe & Reset Mess</h4>
                  <p className="text-xs text-zinc-500 leading-relaxed font-sans">
                    Clears all meal logs, bazar items, deposits, invites, and other member profiles, leaving only this Super Admin profile active.
                  </p>
                  <button
                    onClick={handleOpenWipeModal}
                    className="w-full py-2 bg-red-650 hover:bg-red-500 text-white text-xs font-semibold rounded-lg transition-colors border border-red-800 shadow"
                  >
                    Wipe Everything
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Level 3 Wipe Confirmation Modal */}
      {showWipeModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl w-full max-w-md space-y-6">
            <div>
              <h3 className="text-lg font-bold text-red-400 font-sans">Level 3 Verification Check</h3>
              <p className="text-xs text-zinc-400 mt-1 font-sans">
                To confirm the reset action, please type the name of your mess: <span className="font-bold text-white">"{mess?.name || "RESET"}"</span> below.
              </p>
            </div>

            <div>
              <input
                type="text"
                value={wipeConfirmText}
                onChange={(e) => setWipeConfirmText(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 px-3.5 py-2 rounded-lg text-zinc-200 focus:outline-none focus:border-red-500 text-sm font-sans"
                placeholder="Type mess name here..."
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowWipeModal(false);
                  setWipeConfirmText("");
                }}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleWipeData}
                disabled={wiping || wipeConfirmText !== (mess?.name || "RESET")}
                className="px-4 py-2 bg-red-650 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors shadow-md"
              >
                {wiping ? "Wiping..." : "Confirm & Delete Everything"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
