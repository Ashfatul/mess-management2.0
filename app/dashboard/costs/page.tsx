"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function CostsPage() {
  const [profile, setProfile] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  // Form states
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [buyerId, setBuyerId] = useState("");
  const [category, setCategory] = useState("meal_bazar");
  const [items, setItems] = useState("");
  const [amount, setAmount] = useState("");
  
  // Custom split states
  const [sharedAll, setSharedAll] = useState(true);
  const [selectedSharedMembers, setSelectedSharedMembers] = useState<{ [id: string]: boolean }>({});
  const [customShares, setCustomShares] = useState<{ [id: string]: string }>({});
  const [isCustomMode, setIsCustomMode] = useState(false);
  
  // List states
  const [costs, setCosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const categories = [
    { value: "meal_bazar", name: "Meal Bazar (Regular Daily)" },
    { value: "global_bazar", name: "Monthly Global Bazar (Shared)" },
    { value: "wifi", name: "Wifi Bill" },
    { value: "gas", name: "Gas Bill" },
    { value: "electricity", name: "Electricity Bill" },
    { value: "other", name: "Other Cost" },
  ];

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

  const fetchCosts = async (messId: string) => {
    const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${lastDay}`;

    const { data: costsData } = await supabase
      .from("costs")
      .select(`
        id,
        date,
        cost_category,
        items,
        amount,
        shared_by,
        profile_id,
        added_by,
        profiles!costs_profile_id_fkey(full_name)
      `)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: false });

    setCosts(costsData || []);
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
      setBuyerId(profileData.id);

      const { data: membersData } = await supabase
        .from("profiles")
        .select("*")
        .eq("mess_id", profileData.mess_id);
      
      const activeMembers = membersData || [];
      setMembers(activeMembers);

      // Default all members checked for cost sharing
      const initialChecked: { [id: string]: boolean } = {};
      activeMembers.forEach((m: any) => {
        initialChecked[m.id] = true;
      });
      setSelectedSharedMembers(initialChecked);

      await fetchCosts(profileData.mess_id);
      setLoading(false);
    };

    init();
  }, [selectedMonth, selectedYear]);

  const handleToggleMemberShare = (memberId: string) => {
    setSelectedSharedMembers((prev) => ({
      ...prev,
      [memberId]: !prev[memberId],
    }));
  };

  const handleCustomShareChange = (memberId: string, val: string) => {
    setCustomShares((prev) => ({
      ...prev,
      [memberId]: val,
    }));
  };

  const handleAddCost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setStatusMsg("Please enter a valid positive amount.");
      return;
    }

    const totalAmountVal = Number(amount);
    let payloadSharedBy: any = null;

    if (!sharedAll) {
      const activeCheckedIds = Object.keys(selectedSharedMembers).filter((id) => selectedSharedMembers[id]);
      if (activeCheckedIds.length === 0) {
        setStatusMsg("Please select at least one member to share the cost.");
        return;
      }

      if (isCustomMode) {
        // Validate custom split sum
        let customSum = 0;
        const customObj: { [id: string]: number } = {};
        
        for (const mId of activeCheckedIds) {
          const mShare = Number(customShares[mId] || 0);
          if (mShare <= 0) {
            setStatusMsg("Please enter a valid positive share for all selected members.");
            return;
          }
          customSum += mShare;
          customObj[mId] = mShare;
        }

        if (Math.abs(customSum - totalAmountVal) > 0.01) {
          setStatusMsg(`Sum of custom shares (${customSum} TK) must equal the total amount (${totalAmountVal} TK).`);
          return;
        }

        payloadSharedBy = customObj;
      } else {
        // Equal split among selected members: store as array of IDs
        payloadSharedBy = activeCheckedIds;
      }
    }

    setSaving(true);
    setStatusMsg("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase.from("costs").insert({
        profile_id: buyerId,
        date,
        cost_category: category,
        items,
        amount: totalAmountVal,
        shared_by: payloadSharedBy,
        added_by: session.user.id,
      });

      if (error) throw error;

      setAmount("");
      setItems("");
      setCustomShares({});
      setStatusMsg("Cost logged successfully!");
      if (profile?.mess_id) {
        await fetchCosts(profile.mess_id);
      }
      setTimeout(() => setStatusMsg(""), 3000);
    } catch (err: any) {
      console.error(err);
      setStatusMsg("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCost = async (costId: string) => {
    if (!confirm("Are you sure you want to delete this cost entry?")) return;
    try {
      const { error } = await supabase.from("costs").delete().eq("id", costId);
      if (error) throw error;
      if (profile?.mess_id) {
        await fetchCosts(profile.mess_id);
      }
    } catch (err: any) {
      alert("Error deleting cost: " + err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center bg-zinc-950 text-zinc-50 py-24 gap-4">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-300 text-sm font-medium">Loading Cost Books...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 md:p-8 space-y-8 bg-zinc-950 text-zinc-50 font-sans text-sm md:text-base">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">Bazar & Costs Log</h1>
          <p className="text-sm text-zinc-400">Log out-of-pocket bazar shopping and utility bill payments</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: Cost Input Form */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 space-y-6 backdrop-blur">
          <div>
            <h2 className="text-base font-semibold text-zinc-200 font-sans">Record a Cost</h2>
            <p className="text-xs text-zinc-500 font-sans">Record spending for foods, utilities or others</p>
          </div>

          <form onSubmit={handleAddCost} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5 font-sans">Spender (Who Paid)</label>
              <select
                value={buyerId}
                onChange={(e) => setBuyerId(e.target.value)}
                className="w-full bg-zinc-950/80 border border-zinc-800 px-3.5 py-2.5 rounded-lg text-zinc-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm pr-10 appearance-none cursor-pointer font-sans"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name || m.email}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5 font-sans">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-zinc-950/80 border border-zinc-800 px-3.5 py-2.5 rounded-lg text-zinc-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm pr-10 appearance-none cursor-pointer font-sans"
              >
                {categories.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5 font-sans">Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-zinc-950/80 border border-zinc-800 px-3.5 py-2 rounded-lg text-zinc-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm font-sans"
              />
            </div>

            {/* Custom Cost Split Member Selector */}
            <div className="border border-zinc-800/80 p-4 rounded-xl bg-zinc-950/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300 font-sans">Cost Sharing Split</span>
                <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer font-sans">
                  <input
                    type="checkbox"
                    checked={sharedAll}
                    onChange={(e) => setSharedAll(e.target.checked)}
                    className="rounded border-zinc-800 bg-zinc-950 text-indigo-600 focus:ring-0"
                  />
                  Share with all members
                </label>
              </div>

              {!sharedAll && (
                <div className="pt-2 border-t border-zinc-800/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-500 uppercase font-semibold font-sans">Custom amounts:</span>
                    <label className="flex items-center gap-1 text-[11px] text-indigo-400 cursor-pointer font-sans font-medium">
                      <input
                        type="checkbox"
                        checked={isCustomMode}
                        onChange={(e) => setIsCustomMode(e.target.checked)}
                        className="rounded border-zinc-800 bg-zinc-950 text-indigo-600 focus:ring-0"
                      />
                      Enable custom shares
                    </label>
                  </div>

                  <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                    {members.map((m) => {
                      const isChecked = selectedSharedMembers[m.id] || false;
                      return (
                        <div key={m.id} className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer hover:text-white transition-colors truncate w-36 font-sans">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleMemberShare(m.id)}
                              className="rounded border-zinc-800 bg-zinc-950 text-indigo-600 focus:ring-0"
                            />
                            {m.full_name || m.email}
                          </label>
                          
                          {isCustomMode && isChecked && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <input
                                type="number"
                                placeholder="TK"
                                required
                                value={customShares[m.id] || ""}
                                onChange={(e) => handleCustomShareChange(m.id, e.target.value)}
                                className="w-16 text-right bg-zinc-950 border border-zinc-800 py-1 px-1.5 rounded text-xs text-white placeholder:text-zinc-600"
                              />
                              <span className="text-[10px] text-zinc-500 font-sans">TK</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5 font-sans">Items / Description</label>
              <input
                type="text"
                required
                value={items}
                onChange={(e) => setItems(e.target.value)}
                className="w-full bg-zinc-950/80 border border-zinc-800 px-3.5 py-2.5 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm font-sans"
                placeholder="e.g. Rice, Potatoes, Onions, Wifi Bill"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5 font-sans">Amount (TK)</label>
              <input
                type="number"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-zinc-950/80 border border-zinc-800 px-3.5 py-2.5 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm font-sans"
                placeholder="e.g. 1500"
              />
            </div>

            {statusMsg && (
              <p className={`text-xs font-sans ${statusMsg.startsWith("Error") || statusMsg.includes("must equal") ? "text-red-400" : "text-emerald-400"}`}>
                {statusMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-sm shadow-md transition-colors disabled:opacity-50 font-sans"
            >
              {saving ? "Saving..." : "Log Cost"}
            </button>
          </form>
        </div>

        {/* Right Column: Cost Entries Table */}
        <div className="lg:col-span-2 bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden backdrop-blur flex flex-col h-[640px]">
          <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/55 flex justify-between items-center shrink-0">
            <div>
              <h2 className="font-semibold text-sm md:text-base text-zinc-200 font-sans">Cost Register</h2>
              <p className="text-xs text-zinc-500 font-sans">Record logs for the current month view</p>
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
                  <th className="px-6 py-3.5">Spender</th>
                  <th className="px-6 py-3.5">Category</th>
                  <th className="px-6 py-3.5">Description</th>
                  <th className="px-6 py-3.5">Share Details</th>
                  <th className="px-6 py-3.5">Amount</th>
                  <th className="px-6 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {costs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-zinc-500 text-sm">
                      No costs logged for this month yet.
                    </td>
                  </tr>
                ) : (
                  costs.map((c) => {
                    const mappedSpender = c.profiles?.full_name || "Unknown";
                    const isOwner = c.added_by === profile?.id || profile?.role === "super_admin";
                    const catName = categories.find((cat) => cat.value === c.cost_category)?.name || c.cost_category;
                    
                    // Construct sharing labels based on array or object map type
                    let shareLabel = "All Members";
                    if (c.shared_by) {
                      if (Array.isArray(c.shared_by)) {
                        shareLabel = `${c.shared_by.length} members`;
                      } else {
                        // It is a custom split object
                        const keysCount = Object.keys(c.shared_by).length;
                        shareLabel = `${keysCount} members (Custom)`;
                      }
                    }

                    return (
                      <tr key={c.id} className="hover:bg-zinc-900/10 transition-colors text-sm">
                        <td className="px-6 py-4 text-zinc-400 font-medium whitespace-nowrap">{c.date}</td>
                        <td className="px-6 py-4 text-zinc-200 font-semibold">{mappedSpender}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs">
                            {catName}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-zinc-300 max-w-[120px] truncate" title={c.items}>
                          {c.items}
                        </td>
                        <td className="px-6 py-4 text-zinc-400 whitespace-nowrap">
                          <span className="text-xs border border-zinc-800/80 px-2 py-0.5 rounded bg-zinc-900/40 font-medium font-sans">
                            👤 {shareLabel}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-bold text-white whitespace-nowrap">{c.amount.toFixed(2)} TK</td>
                        <td className="px-6 py-4 text-right">
                          {isOwner && (
                            <button
                              onClick={() => handleDeleteCost(c.id)}
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
