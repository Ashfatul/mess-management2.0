"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { fetchMonthlyStatus, activeMembersFor, MemberMonthStatusRow } from "@/lib/membership";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

export default function CostsPage() {
  const [profile, setProfile] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [monthlyStatus, setMonthlyStatus] = useState<MemberMonthStatusRow[]>([]);
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
  const [editingCostId, setEditingCostId] = useState<string | null>(null);
  
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

      setMonthlyStatus(await fetchMonthlyStatus(profileData.mess_id));

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

  const recalculateTotalFromCustomShares = (
    currentCustomShares: { [id: string]: string }, 
    currentSharedMembers: { [id: string]: boolean }
  ) => {
    const activeCheckedIds = Object.keys(currentSharedMembers).filter((id) => currentSharedMembers[id]);
    let total = 0;
    activeCheckedIds.forEach((id) => {
      total += Number(currentCustomShares[id] || 0);
    });
    setAmount(total > 0 ? total.toString() : "");
  };

  const handleToggleMemberShare = (memberId: string) => {
    setSelectedSharedMembers((prev) => {
      const updated = {
        ...prev,
        [memberId]: !prev[memberId],
      };
      if (isCustomMode) {
        recalculateTotalFromCustomShares(customShares, updated);
      }
      return updated;
    });
  };

  const handleCustomShareChange = (memberId: string, val: string) => {
    setCustomShares((prev) => {
      const updated = {
        ...prev,
        [memberId]: val,
      };
      if (isCustomMode) {
        recalculateTotalFromCustomShares(updated, selectedSharedMembers);
      }
      return updated;
    });
  };

  const handleToggleCustomMode = (enabled: boolean) => {
    setIsCustomMode(enabled);
    if (enabled) {
      recalculateTotalFromCustomShares(customShares, selectedSharedMembers);
    }
  };

  const handleCategoryChange = (val: string) => {
    setCategory(val);
    if (val === "wifi") {
      setItems("Wifi Bill");
    } else if (val === "gas") {
      setItems("Gas Bill");
    } else if (val === "electricity") {
      setItems("Electricity Bill");
    } else if (val === "meal_bazar") {
      setItems("Regular Meal Bazar");
    } else if (val === "global_bazar") {
      setItems("Monthly Global Bazar");
    } else {
      setItems("");
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  };

  const handleEditClick = (cost: any) => {
    setEditingCostId(cost.id);
    setDate(cost.date);
    setBuyerId(cost.profile_id || "shared");
    setCategory(cost.cost_category);
    setItems(cost.items);
    setAmount(cost.amount.toString());

    if (!cost.profile_id && cost.shared_by) {
      setSharedAll(false);
      const newChecked: { [id: string]: boolean } = {};
      const newCustom: { [id: string]: string } = {};

      if (Array.isArray(cost.shared_by)) {
        setIsCustomMode(false);
        members.forEach(m => newChecked[m.id] = cost.shared_by.includes(m.id));
      } else {
        setIsCustomMode(true);
        members.forEach(m => {
          if (cost.shared_by[m.id]) {
            newChecked[m.id] = true;
            newCustom[m.id] = cost.shared_by[m.id].toString();
          } else {
            newChecked[m.id] = false;
          }
        });
        setCustomShares(newCustom);
      }
      setSelectedSharedMembers(newChecked);
    } else {
      setSharedAll(true);
      setIsCustomMode(false);
      setCustomShares({});
      const initialChecked: { [id: string]: boolean } = {};
      members.forEach((m: any) => initialChecked[m.id] = true);
      setSelectedSharedMembers(initialChecked);
    }
    
    // scroll to top to see form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingCostId(null);
    setDate(new Date().toISOString().split("T")[0]);
    setBuyerId(profile?.id || "");
    setCategory("meal_bazar");
    setItems("");
    setAmount("");
    setSharedAll(true);
    setIsCustomMode(false);
    setCustomShares({});
    const initialChecked: { [id: string]: boolean } = {};
    members.forEach((m: any) => initialChecked[m.id] = true);
    setSelectedSharedMembers(initialChecked);
  };

  const handleAddCost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setStatusMsg("Please enter a valid positive amount.");
      return;
    }

    const totalAmountVal = Number(amount);
    let payloadSharedBy: any = null;
    const isSharedSpender = buyerId === "shared";

    if (isSharedSpender) {
      if (!sharedAll) {
        // Only members active for the cost's month can be part of the split.
        const formActiveIds = new Set(formActiveMembers.map((m: any) => m.id));
        const activeCheckedIds = Object.keys(selectedSharedMembers).filter(
          (id) => selectedSharedMembers[id] && formActiveIds.has(id)
        );
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
    } else {
      // Specific user is Spender: cost is shared by all members by default
      payloadSharedBy = null;
    }

    setSaving(true);
    setStatusMsg("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const payload = {
        profile_id: isSharedSpender ? null : buyerId,
        date,
        cost_category: category,
        items,
        amount: totalAmountVal,
        shared_by: payloadSharedBy,
        added_by: session.user.id,
      };

      if (editingCostId) {
        const { error } = await supabase.from("costs").update(payload).eq("id", editingCostId);
        if (error) throw error;
        setStatusMsg("Cost updated successfully!");
        setEditingCostId(null);
      } else {
        const { error } = await supabase.from("costs").insert(payload);
        if (error) throw error;
        setStatusMsg("Cost logged successfully!");
      }

      setAmount("");
      setItems("");
      setCustomShares({});
      
      // Reset form specifically for Date
      setDate(new Date().toISOString().split("T")[0]);
      setCategory("meal_bazar");
      setBuyerId(profile?.id || "");

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

  // Only members active in the cost's month can be its spender or share it.
  const [costYear, costMonth] = date.split("-").map((n) => parseInt(n, 10));
  const formActiveMembers = activeMembersFor(members, monthlyStatus, costYear, costMonth);

  return (
    <div className="flex-1 bg-zinc-950 text-zinc-50 font-sans text-sm md:text-base flex flex-col h-full overflow-hidden">
      {/* Sticky Upper Action Bar */}
      <div className="sticky top-0 z-20 bg-zinc-950/80 backdrop-blur-md px-4 sm:px-6 md:px-8 py-4 sm:py-6 border-b border-zinc-900 shrink-0">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-white">Bazar & Costs Log</h1>
          <p className="text-xs sm:text-sm text-zinc-400">Log out-of-pocket bazar shopping and utility bill payments</p>
        </div>
      </div>

      {/* Scrollable Page Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 items-start">
          {/* Left Column: Cost Input Form */}
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 sm:p-6 space-y-5 sm:space-y-6 backdrop-blur">
            <div>
              <h2 className="text-base font-semibold text-zinc-200 font-sans">
                {editingCostId ? "Edit Cost" : "Record a Cost"}
              </h2>
              <p className="text-xs text-zinc-500 font-sans">
                {editingCostId ? "Update existing spending" : "Record spending for foods, utilities or others"}
              </p>
            </div>

             <form onSubmit={handleAddCost} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1.5 font-sans">Spender (Who Paid)</label>
                <select
                  value={buyerId}
                  onChange={(e) => setBuyerId(e.target.value)}
                  className="w-full bg-zinc-950/80 border border-zinc-800 px-3.5 py-2.5 rounded-lg text-zinc-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm pr-10 appearance-none cursor-pointer font-sans"
                >
                  <option value="shared">Shared (Paid from Mess Box / Shared Fund)</option>
                  {formActiveMembers.map((m) => (
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
                  onChange={(e) => handleCategoryChange(e.target.value)}
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
                <label className="flex items-center gap-2 text-sm font-medium text-zinc-400 mb-1.5 font-sans">
                  Date
                  <span className="group relative cursor-pointer flex items-center justify-center w-4 h-4 rounded-full bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors text-[10px]">
                    i
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block bg-zinc-800 text-white text-[10px] py-1 px-2 rounded whitespace-nowrap shadow-xl border border-zinc-700 z-50">
                      Format: DD/MM/YYYY
                    </span>
                  </span>
                </label>
                <div className="w-full">
                  <DatePicker
                    selected={date ? new Date(date) : new Date()}
                    onChange={(d: Date | null) => {
                      if (d) {
                        const offsetDate = new Date(d.getTime() - (d.getTimezoneOffset() * 60000));
                        setDate(offsetDate.toISOString().split("T")[0]);
                      }
                    }}
                    dateFormat="dd/MM/yyyy"
                    className="w-full bg-zinc-950/80 border border-zinc-800 px-3.5 py-2 rounded-lg text-zinc-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm font-sans"
                    wrapperClassName="w-full"
                  />
                </div>
              </div>

              {/* Custom Cost Split Member Selector - only applies to Shared Box spending */}
              {buyerId === "shared" && (
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
                            onChange={(e) => handleToggleCustomMode(e.target.checked)}
                            className="rounded border-zinc-800 bg-zinc-950 text-indigo-600 focus:ring-0"
                          />
                          Enable custom shares
                        </label>
                      </div>

                      <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                        {formActiveMembers.map((m) => {
                          const isChecked = selectedSharedMembers[m.id] || false;
                          return (
                            <div key={m.id} className="flex items-center justify-between gap-2">
                              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer hover:text-white transition-colors truncate min-w-0 flex-1 font-sans">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleMemberShare(m.id)}
                                  className="rounded border-zinc-800 bg-zinc-950 text-indigo-600 focus:ring-0 shrink-0"
                                />
                                <span className="truncate">{m.full_name || m.email}</span>
                              </label>

                              {isCustomMode && isChecked && (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="TK"
                                    required
                                    value={customShares[m.id] || ""}
                                    onChange={(e) => handleCustomShareChange(m.id, e.target.value)}
                                    className="w-14 sm:w-16 text-right bg-zinc-950 border border-zinc-800 py-1 px-1.5 rounded text-xs text-white placeholder:text-zinc-600"
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
              )}

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
                <label className="block text-sm font-medium text-zinc-400 mb-1.5 font-sans">
                  Amount (TK) {isCustomMode && buyerId === "shared" && <span className="text-xs text-indigo-400 font-normal ml-1">(Calculated)</span>}
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isCustomMode && buyerId === "shared"}
                  className="w-full bg-zinc-950/80 border border-zinc-800 px-3.5 py-2.5 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm font-sans disabled:opacity-50"
                  placeholder={isCustomMode && buyerId === "shared" ? "Sum of custom shares" : "e.g. 1500"}
                />
              </div>

              {statusMsg && (
                <p className={`text-xs font-sans ${statusMsg.startsWith("Error") || statusMsg.includes("must equal") ? "text-red-400" : "text-emerald-400"}`}>
                  {statusMsg}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-sm shadow-md transition-colors disabled:opacity-50 font-sans"
                >
                  {saving ? "Saving..." : editingCostId ? "Update Cost" : "Log Cost"}
                </button>
                {editingCostId && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    disabled={saving}
                    className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-lg text-sm shadow-md transition-colors disabled:opacity-50 font-sans"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Right Column: Cost Entries Table */}
          <div className="lg:col-span-2 bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden backdrop-blur flex flex-col h-[560px] sm:h-[640px]">
            <div className="px-4 sm:px-6 py-4 border-b border-zinc-800 bg-zinc-900/55 flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center shrink-0">
              <div>
                <h2 className="font-semibold text-sm md:text-base text-zinc-200 font-sans">Cost Register</h2>
                <p className="text-xs text-zinc-500 font-sans">Record logs for the current month view</p>
              </div>

              <div className="flex gap-2">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="bg-zinc-950 text-xs border border-zinc-800 focus:ring-0 text-zinc-300 py-1.5 px-3 rounded-lg cursor-pointer pr-7 appearance-none"
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
                  className="bg-zinc-950 text-xs border border-zinc-800 focus:ring-0 text-zinc-300 py-1.5 px-3 rounded-lg cursor-pointer pr-7 appearance-none"
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
              <table className="w-full text-left text-sm text-zinc-300 border-collapse min-w-[720px]">
                <thead className="bg-zinc-950/80 text-xs text-zinc-400 border-b border-zinc-800 uppercase tracking-wider sticky top-0 z-10">
                  <tr>
                    <th className="px-4 sm:px-6 py-3.5 bg-zinc-950">Date</th>
                    <th className="px-4 sm:px-6 py-3.5">Spender</th>
                    <th className="px-4 sm:px-6 py-3.5">Category</th>
                    <th className="px-4 sm:px-6 py-3.5 bg-zinc-950">Description</th>
                    <th className="px-4 sm:px-6 py-3.5">Share Details</th>
                    <th className="px-4 sm:px-6 py-3.5">Amount</th>
                    <th className="px-4 sm:px-6 py-3.5 text-right sticky right-0 bg-zinc-950 z-20 shadow-[-8px_0_12px_rgba(0,0,0,0.5)]">Action</th>
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
                      const mappedSpender = c.profiles?.full_name || (c.profile_id ? "Unknown" : "Shared / Mess Box");
                      const isOwner = c.added_by === profile?.id || profile?.role === "super_admin";
                      const catName = categories.find((cat) => cat.value === c.cost_category)?.name || c.cost_category;

                      let shareLabel = "All Members";
                      if (c.shared_by) {
                        if (Array.isArray(c.shared_by)) {
                          if (c.shared_by.length === 1 && c.shared_by[0] === c.profile_id) {
                            shareLabel = "Personal Expense";
                          } else {
                            shareLabel = `${c.shared_by.length} members`;
                          }
                        } else {
                          const keysCount = Object.keys(c.shared_by).length;
                          shareLabel = `${keysCount} members (Custom)`;
                        }
                      }

                      return (
                        <tr key={c.id} className="hover:bg-zinc-900/10 transition-colors text-sm">
                          <td className="px-4 sm:px-6 py-4 text-zinc-400 font-medium whitespace-nowrap">{formatDate(c.date)}</td>
                          <td className="px-4 sm:px-6 py-4 text-zinc-200 font-semibold whitespace-nowrap">{mappedSpender}</td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                            <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs">
                              {catName}
                            </span>
                          </td>
                          <td className="px-4 sm:px-6 py-4 text-zinc-300 max-w-[120px] truncate" title={c.items}>
                            {c.items}
                          </td>
                          <td className="px-4 sm:px-6 py-4 text-zinc-400 whitespace-nowrap">
                            <span className="text-xs border border-zinc-800/80 px-2 py-0.5 rounded bg-zinc-900/40 font-medium font-sans">
                              👤 {shareLabel}
                            </span>
                          </td>
                          <td className="px-4 sm:px-6 py-4 font-bold text-white whitespace-nowrap">{c.amount.toFixed(2)} TK</td>
                          <td className="px-4 sm:px-6 py-4 text-right sticky right-0 bg-zinc-950 shadow-[-8px_0_12px_rgba(0,0,0,0.3)] whitespace-nowrap">
                            {isOwner && (
                              <div className="flex justify-end gap-1.5 bg-zinc-950">
                                <button
                                  onClick={() => handleEditClick(c)}
                                  className="text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 p-1.5 rounded-md transition-colors"
                                  title="Edit"
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={() => handleDeleteCost(c.id)}
                                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-1.5 rounded-md transition-colors"
                                  title="Delete"
                                >
                                  🗑️
                                </button>
                              </div>
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
