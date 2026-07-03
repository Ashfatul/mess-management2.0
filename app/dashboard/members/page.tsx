"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function MembersPage() {
  const [profile, setProfile] = useState<any>(null);
  const [mess, setMess] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Settings state
  const [mealEntryRule, setMealEntryRule] = useState("anyone");
  const [updatingSettings, setUpdatingSettings] = useState(false);
  
  // Form states
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const [baseUrl, setBaseUrl] = useState("");

  const fetchMembersAndInvites = async (messId: string) => {
    // 1. Fetch active members
    const { data: membersData } = await supabase
      .from("profiles")
      .select("*")
      .eq("mess_id", messId);
    setMembers(membersData || []);

    // 2. Fetch pending invites
    const { data: invitesData } = await supabase
      .from("invites")
      .select("*")
      .eq("mess_id", messId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    setInvites(invitesData || []);
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(window.location.origin);
    }

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
        setMealEntryRule(messData.meal_entry_rule || "anyone");
      }

      await fetchMembersAndInvites(profileData.mess_id);
      setLoading(false);
    };

    init();
  }, []);

  const handleUpdateSettings = async (rule: string) => {
    if (!profile?.mess_id) return;
    setUpdatingSettings(true);
    setMealEntryRule(rule);
    try {
      const { error } = await supabase
        .from("messes")
        .update({ meal_entry_rule: rule })
        .eq("id", profile.mess_id);

      if (error) throw error;
      
      // Refresh local mess data
      const { data: updatedMess } = await supabase
        .from("messes")
        .select("*")
        .eq("id", profile.mess_id)
        .single();
      if (updatedMess) setMess(updatedMess);
    } catch (err: any) {
      alert("Error updating settings: " + err.message);
    } finally {
      setUpdatingSettings(false);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setSubmitting(true);
    setStatusMsg("");

    try {
      if (profile.role !== "super_admin") {
        throw new Error("Only Super Admins can invite new members.");
      }

      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("*")
        .eq("email", inviteEmail.trim())
        .single();

      if (existingProfile) {
        throw new Error("A user with this email is already registered.");
      }

      const { data: existingInvite } = await supabase
        .from("invites")
        .select("*")
        .eq("email", inviteEmail.trim())
        .eq("status", "pending")
        .single();

      if (existingInvite) {
        throw new Error("A pending invite already exists for this email.");
      }

      const { error } = await supabase.from("invites").insert({
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        mess_id: profile.mess_id,
        status: "pending",
      });

      if (error) throw error;

      setInviteEmail("");
      setStatusMsg("Invitation created successfully!");
      await fetchMembersAndInvites(profile.mess_id);
      setTimeout(() => setStatusMsg(""), 3000);
    } catch (err: any) {
      console.error(err);
      setStatusMsg("Error: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteInvite = async (inviteId: string) => {
    if (!confirm("Are you sure you want to cancel this invitation?")) return;
    try {
      const { error } = await supabase.from("invites").delete().eq("id", inviteId);
      if (error) throw error;
      await fetchMembersAndInvites(profile.mess_id);
    } catch (err: any) {
      alert("Error canceling invitation: " + err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center bg-zinc-950 text-zinc-50 py-24 gap-4">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-300 text-sm font-medium">Loading Members directory...</p>
      </div>
    );
  }

  const isSuperAdmin = profile?.role === "super_admin";

  return (
    <div className="flex-1 p-6 md:p-8 space-y-8 bg-zinc-950 text-zinc-50 font-sans text-sm md:text-base">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">Members & Role Management</h1>
          <p className="text-sm text-zinc-400">View mess members and invite new people to join</p>
        </div>
      </div>

      {/* Mess Settings Card */}
      <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 backdrop-blur max-w-2xl">
        <h2 className="text-base font-semibold text-zinc-200 mb-2 font-sans">Mess Permissions Settings</h2>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm text-zinc-300 font-sans">Who is allowed to enter meal logs?</p>
            <p className="text-xs text-zinc-500 font-sans">Restricts meal recording permissions on the Meal Log page.</p>
          </div>
          <div>
            {isSuperAdmin ? (
              <select
                value={mealEntryRule}
                disabled={updatingSettings}
                onChange={(e) => handleUpdateSettings(e.target.value)}
                className="bg-zinc-950 text-xs border border-zinc-800 focus:ring-0 text-zinc-200 py-2 px-3.5 rounded-lg cursor-pointer pr-10 appearance-none font-bold"
              >
                <option value="anyone">Anyone (Add for all members)</option>
                <option value="member_self_only">Each member logs for themselves only</option>
                <option value="admin_only">Only Super Admins</option>
              </select>
            ) : (
              <span className="px-3 py-1 rounded-full bg-zinc-800 text-zinc-300 text-xs font-semibold font-sans">
                {mealEntryRule === "admin_only" 
                  ? "🔒 Only Super Admins" 
                  : mealEntryRule === "member_self_only"
                  ? "👤 Self Logging Only"
                  : "🔓 Anyone in the Mess"}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: Invite Member Form */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 space-y-6 backdrop-blur">
          <div>
            <h2 className="text-base font-semibold text-zinc-200 font-sans">Invite Member</h2>
            <p className="text-xs text-zinc-500 font-sans font-medium">
              {isSuperAdmin
                ? "Send an invite to a member email address"
                : "Only Super Admins can send invitations"}
            </p>
          </div>

          <form onSubmit={handleSendInvite} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5 font-sans">Email Address</label>
              <input
                type="email"
                required
                disabled={!isSuperAdmin}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full bg-zinc-950/80 border border-zinc-800 px-3.5 py-2.5 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm disabled:opacity-50 font-sans"
                placeholder="name@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5 font-sans">Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                disabled={!isSuperAdmin}
                className="w-full bg-zinc-950/80 border border-zinc-800 px-3.5 py-2.5 rounded-lg text-zinc-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm pr-10 appearance-none cursor-pointer font-sans"
              >
                <option value="member">Member</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>

            {statusMsg && (
              <p className={`text-xs font-sans ${statusMsg.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}>
                {statusMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !isSuperAdmin}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-sm shadow-md transition-colors disabled:opacity-50 font-sans"
            >
              {submitting ? "Inviting..." : "Invite Member"}
            </button>
          </form>
        </div>

        {/* Right Column: Active Members and Pending Invites List */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active Members Table */}
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden backdrop-blur">
            <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/55">
              <h2 className="font-semibold text-sm md:text-base text-zinc-200 font-sans">Active Members</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-zinc-300 border-collapse">
                <thead className="bg-zinc-950/80 text-xs text-zinc-400 border-b border-zinc-800 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Name</th>
                    <th className="px-6 py-3.5">Email</th>
                    <th className="px-6 py-3.5">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {members.map((m) => (
                    <tr key={m.id} className="hover:bg-zinc-900/10 transition-colors text-sm md:text-base">
                      <td className="px-6 py-4 font-bold text-white">{m.full_name || "Unnamed"}</td>
                      <td className="px-6 py-4 text-zinc-400 font-medium">{m.email}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          m.role === "super_admin"
                            ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                            : "bg-zinc-800 text-zinc-300"
                        }`}>
                          {m.role === "super_admin" ? "Super Admin" : "Member"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pending Invites Table */}
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden backdrop-blur">
            <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/55">
              <h2 className="font-semibold text-sm md:text-base text-zinc-200 font-sans">Pending Invitations</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-zinc-300 border-collapse">
                <thead className="bg-zinc-950/80 text-xs text-zinc-400 border-b border-zinc-800 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Email</th>
                    <th className="px-6 py-3.5">Role</th>
                    <th className="px-6 py-3.5">Signup Link (Autofill Email)</th>
                    <th className="px-6 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {invites.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-8 text-zinc-500 text-sm">
                        No pending invites.
                      </td>
                    </tr>
                  ) : (
                    invites.map((inv) => {
                      const signupLink = `${baseUrl}/signup?token=${inv.token}`;
                      return (
                        <tr key={inv.id} className="hover:bg-zinc-900/10 transition-colors text-sm">
                          <td className="px-6 py-4 font-bold text-white">{inv.email}</td>
                          <td className="px-6 py-4">
                            <span className="px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-xs font-semibold">
                              {inv.role}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                readOnly
                                value={signupLink}
                                className="bg-zinc-950 text-xs border border-zinc-800 px-3 py-1.5 rounded w-52 text-zinc-400 font-sans"
                              />
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(signupLink);
                                  alert("Signup link copied to clipboard!");
                                }}
                                className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-1.5 px-3 rounded transition-colors font-sans"
                              >
                                Copy
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {isSuperAdmin && (
                              <button
                                onClick={() => handleDeleteInvite(inv.id)}
                                className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-1.5 rounded-md transition-colors"
                                title="Cancel Invite"
                              >
                                🗑️
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
