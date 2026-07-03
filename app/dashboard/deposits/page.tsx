"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function DepositsPage() {
  const [profile, setProfile] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  // Form states
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [memberId, setMemberId] = useState("");
  const [amount, setAmount] = useState("");
  
  // List states
  const [deposits, setDeposits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const months = [
    { value: 1, name: "January" },
    { value: 2, name: "February" },
    { value: 3, name: "March" },
    { value: 4, name: "April" },
    { value: 5, name: "May" },
    { value: 6, name: "June" },
    { value: 7, name: "July" },
    { value: 8, name: "August" },
    { value: 9, name: "September" },
    { value: 10, name: "October" },
    { value: 11, name: "November" },
    { value: 12, name: "December" },
  ];

  const fetchDeposits = async (messId: string) => {
    const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${lastDay}`;

    const { data: depositsData } = await supabase
      .from("deposits")
      .select(`
        id,
        date,
        amount,
        profile_id,
        added_by,
        profiles!deposits_profile_id_fkey(full_name)
      `)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: false });

    setDeposits(depositsData || []);
  };

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
      setMemberId(profileData.id);

      const { data: membersData } = await supabase
        .from("profiles")
        .select("*")
        .eq("mess_id", profileData.mess_id);
      
      setMembers(membersData || []);
      await fetchDeposits(profileData.mess_id);
      setLoading(false);
    };

    init();
  }, [selectedMonth, selectedYear]);

  const handleAddDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setStatusMsg("Please enter a valid positive amount.");
      return;
    }
    setSaving(true);
    setStatusMsg("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase.from("deposits").insert({
        profile_id: memberId,
        date,
        amount: Number(amount),
        added_by: session.user.id,
      });

      if (error) throw error;

      setAmount("");
      setStatusMsg("Deposit logged successfully!");
      if (profile?.mess_id) {
        await fetchDeposits(profile.mess_id);
      }
      setTimeout(() => setStatusMsg(""), 3000);
    } catch (err: any) {
      console.error(err);
      setStatusMsg("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDeposit = async (depositId: string) => {
    if (!confirm("Are you sure you want to delete this deposit entry?")) return;
    try {
      const { error } = await supabase.from("deposits").delete().eq("id", depositId);
      if (error) throw error;
      if (profile?.mess_id) {
        await fetchDeposits(profile.mess_id);
      }
    } catch (err: any) {
      alert("Error deleting deposit: " + err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center bg-zinc-950 text-zinc-50 py-24 gap-4">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-300 text-sm font-medium">Loading Deposit Ledgers...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 md:p-8 space-y-8 bg-zinc-950 text-zinc-50 font-sans text-sm md:text-base">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">Deposit Log</h1>
          <p className="text-sm text-zinc-400">Record cash deposits given by members to pool the mess fund</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: Form */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 space-y-6 backdrop-blur">
          <div>
            <h2 className="text-base font-semibold text-zinc-200">Log a Deposit</h2>
            <p className="text-xs text-zinc-500">Record cash received from a mess member</p>
          </div>

          <form onSubmit={handleAddDeposit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5 font-medium">Depositor (Member)</label>
              <select
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                className="w-full bg-zinc-950/80 border border-zinc-800 px-3.5 py-2.5 rounded-lg text-zinc-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm pr-10 appearance-none cursor-pointer"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name || m.email}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5 font-medium">Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-zinc-950/80 border border-zinc-800 px-3.5 py-2 rounded-lg text-zinc-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5 font-medium">Amount (TK)</label>
              <input
                type="number"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-zinc-950/80 border border-zinc-800 px-3.5 py-2.5 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                placeholder="e.g. 2000"
              />
            </div>

            {statusMsg && (
              <p className={`text-xs ${statusMsg.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}>
                {statusMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-sm shadow-md transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Log Deposit"}
            </button>
          </form>
        </div>

        {/* Right Column: List Table */}
        <div className="lg:col-span-2 bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden backdrop-blur flex flex-col h-[560px]">
          <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/55 flex justify-between items-center shrink-0">
            <div>
              <h2 className="font-semibold text-sm md:text-base text-zinc-200">Deposit Registry</h2>
              <p className="text-xs text-zinc-500">Record logs for the current month view</p>
            </div>

            <div className="flex gap-2">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="bg-zinc-950 text-xs border border-zinc-800 focus:ring-0 text-zinc-300 py-1.5 px-3 rounded-lg cursor-pointer pr-8 appearance-none"
              >
                {months.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.name}
                  </option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-zinc-950 text-xs border border-zinc-800 focus:ring-0 text-zinc-300 py-1.5 px-3 rounded-lg cursor-pointer pr-8 appearance-none"
              >
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-sm text-zinc-300 border-collapse">
              <thead className="bg-zinc-950/80 text-xs text-zinc-400 border-b border-zinc-800 uppercase tracking-wider sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3.5 bg-zinc-950">Date</th>
                  <th className="px-6 py-3.5">Deposited By</th>
                  <th className="px-6 py-3.5">Amount</th>
                  <th className="px-6 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {deposits.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-16 text-zinc-500 text-sm">
                      No deposits logged for this month yet.
                    </td>
                  </tr>
                ) : (
                  deposits.map((d) => {
                    const depositorName = d.profiles?.full_name || "Unknown";
                    const isOwner = d.added_by === profile?.id || profile?.role === "super_admin";
                    return (
                      <tr key={d.id} className="hover:bg-zinc-900/10 transition-colors text-sm md:text-base">
                        <td className="px-6 py-4 text-zinc-400 font-medium">{d.date}</td>
                        <td className="px-6 py-4 text-zinc-200 font-semibold">{depositorName}</td>
                        <td className="px-6 py-4 font-bold text-white">{d.amount.toFixed(2)} TK</td>
                        <td className="px-6 py-4 text-right">
                          {isOwner && (
                            <button
                              onClick={() => handleDeleteDeposit(d.id)}
                              className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-1.5 rounded-md transition-colors"
                              title="Delete"
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
  );
}
