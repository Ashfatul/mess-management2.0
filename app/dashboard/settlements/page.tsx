"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchMonthlyStatus, activeMembersFor, MemberMonthStatusRow } from "@/lib/membership";

export default function SettlementsPage() {
  const [profile, setProfile] = useState<any>(null);
  const [mess, setMess] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [settlingId, setSettlingId] = useState<string | null>(null);

  // Historical raw data
  const [allPastMeals, setAllPastMeals] = useState<any[]>([]);
  const [allPastCosts, setAllPastCosts] = useState<any[]>([]);
  const [allPastDeposits, setAllPastDeposits] = useState<any[]>([]);
  const [allSettlements, setAllSettlements] = useState<any[]>([]);
  const [monthlyStatus, setMonthlyStatus] = useState<MemberMonthStatusRow[]>([]);

  // Selected past month state
  const [pastMonthsList, setPastMonthsList] = useState<any[]>([]);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null); // "YYYY-MM"

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

  const getPastMonths = (createdDateStr?: string) => {
    const list: any[] = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-indexed

    // Start up to 12 months ago
    let startYear = currentYear;
    let startMonth = currentMonth - 12;
    if (startMonth <= 0) {
      startYear -= 1;
      startMonth += 12;
    }

    // Limit to mess creation date if available
    if (createdDateStr) {
      const created = new Date(createdDateStr);
      const cYear = created.getFullYear();
      const cMonth = created.getMonth() + 1;
      if (cYear > startYear || (cYear === startYear && cMonth > startMonth)) {
        startYear = cYear;
        startMonth = cMonth;
      }
    }

    let y = startYear;
    let m = startMonth;

    // Must be strictly earlier than current calendar month
    while (y < currentYear || (y === currentYear && m < currentMonth)) {
      list.push({ year: y, month: m, key: `${y}-${String(m).padStart(2, "0")}` });
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }

    return list.reverse(); // Newest past month first
  };

  const fetchSettlementData = async (messId: string, createdDateStr?: string) => {
    const monthsList = getPastMonths(createdDateStr);
    setPastMonthsList(monthsList);
    if (monthsList.length > 0 && !selectedMonthKey) {
      setSelectedMonthKey(monthsList[0].key);
    }

    if (monthsList.length === 0) {
      setLoading(false);
      return;
    }

    // Fetch all historical events
    const startRange = monthsList[monthsList.length - 1].key + "-01";
    const lastDay = new Date(monthsList[0].year, monthsList[0].month, 0).getDate();
    const endRange = monthsList[0].key + "-" + String(lastDay).padStart(2, "0");

    const [mealsRes, costsRes, depositsRes, settlementsRes] = await Promise.all([
      supabase.from("meals").select("*").gte("date", startRange).lte("date", endRange),
      supabase.from("costs").select("*").gte("date", startRange).lte("date", endRange),
      supabase.from("deposits").select("*").gte("date", startRange).lte("date", endRange),
      supabase.from("settlements").select("*").eq("mess_id", messId)
    ]);

    setAllPastMeals(mealsRes.data || []);
    setAllPastCosts(costsRes.data || []);
    setAllPastDeposits(depositsRes.data || []);
    setAllSettlements(settlementsRes.data || []);
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

      const { data: messData } = await supabase
        .from("messes")
        .select("*")
        .eq("id", profileData.mess_id)
        .single();
      setMess(messData);

      const { data: membersData } = await supabase
        .from("profiles")
        .select("*")
        .eq("mess_id", profileData.mess_id);
      setMembers(membersData || []);

      setMonthlyStatus(await fetchMonthlyStatus(profileData.mess_id));

      await fetchSettlementData(profileData.mess_id, messData?.created_at);
      setLoading(false);
    };

    init();
  }, []);

  const handleSettleDue = async (targetProfileId: string, year: number, month: number) => {
    if (!profile || profile.role !== "super_admin") {
      alert("Only Super Admins can update settlement status.");
      return;
    }

    setSettlingId(targetProfileId);
    try {
      const { error } = await supabase.from("settlements").upsert({
        mess_id: profile.mess_id,
        year,
        month,
        profile_id: targetProfileId,
        status: "settled",
        settled_by: profile.id,
        settled_at: new Date().toISOString()
      }, {
        onConflict: "mess_id,year,month,profile_id"
      });

      if (error) throw error;

      // Refresh settlement status
      const { data: settlementsRes } = await supabase
        .from("settlements")
        .select("*")
        .eq("mess_id", profile.mess_id);
      setAllSettlements(settlementsRes || []);
    } catch (err: any) {
      console.error(err);
      alert("Error settling due: " + err.message);
    } finally {
      setSettlingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center bg-zinc-950 text-zinc-50 py-24 gap-4">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-300 text-sm font-medium">Loading settlement histories...</p>
      </div>
    );
  }

  const isPayAsYouGo = mess?.deposit_mode === "pay_as_you_go";

  // Process data for each month to find settled/unsettled status
  const monthsWithCalculatedStatus = pastMonthsList.map((mItem) => {
    const startDate = `${mItem.year}-${String(mItem.month).padStart(2, "0")}-01`;
    const lastDay = new Date(mItem.year, mItem.month, 0).getDate();
    const endDate = `${mItem.year}-${String(mItem.month).padStart(2, "0")}-${lastDay}`;

    // Only members active for THIS month participate in cost sharing.
    const monthMembers = activeMembersFor(members, monthlyStatus, mItem.year, mItem.month);
    const memberCount = monthMembers.length || 1;

    const monthMeals = allPastMeals.filter((m) => m.date >= startDate && m.date <= endDate);
    const monthCosts = allPastCosts.filter((c) => c.date >= startDate && c.date <= endDate);
    const monthDeposits = allPastDeposits.filter((d) => d.date >= startDate && d.date <= endDate);
    const monthSettlements = allSettlements.filter((s) => s.year === mItem.year && s.month === mItem.month);

    const totalMeals = monthMeals.reduce((sum, meal) => sum + Number(meal.count || 0), 0);
    const totalMealBazarCost = monthCosts
      .filter((c) => c.cost_category === "meal_bazar")
      .reduce((sum, c) => sum + Number(c.amount || 0), 0);
    const totalGlobalBazarCost = monthCosts
      .filter((c) => c.cost_category === "global_bazar")
      .reduce((sum, c) => sum + Number(c.amount || 0), 0);
    const totalMealCost = totalMealBazarCost + totalGlobalBazarCost;
    const mealRate = totalMeals > 0 ? totalMealCost / totalMeals : 0;

    const totalOtherCost = monthCosts
      .filter((c) => c.cost_category !== "meal_bazar" && c.cost_category !== "global_bazar")
      .reduce((sum, c) => sum + Number(c.amount || 0), 0);

    const rows = monthMembers.map((member) => {
      const mMeals = monthMeals
        .filter((meal) => meal.profile_id === member.id)
        .reduce((sum, meal) => sum + Number(meal.count || 0), 0);

      const mMealCostShare = mMeals * (totalMeals > 0 ? totalMealCost / totalMeals : 0);

      const mOtherCostShare = monthCosts
        .filter((c) => c.cost_category !== "meal_bazar" && c.cost_category !== "global_bazar")
        .reduce((sum, c) => sum + (Number(c.amount || 0) / memberCount), 0);

      const mTotalCostShare = mMealCostShare + mOtherCostShare;

      const mDirectSpending = monthCosts
        .reduce((sum, c) => {
          if (c.profile_id === member.id) {
            return sum + Number(c.amount || 0);
          } else if (c.profile_id === null) {
            if (c.shared_by) {
              if (Array.isArray(c.shared_by)) {
                if (c.shared_by.includes(member.id)) {
                  return sum + (Number(c.amount || 0) / c.shared_by.length);
                }
              } else {
                if (c.shared_by[member.id] !== undefined) {
                  return sum + Number(c.shared_by[member.id] || 0);
                }
              }
            } else {
              return sum + (Number(c.amount || 0) / memberCount);
            }
          }
          return sum;
        }, 0);

      const mDeposited = isPayAsYouGo
        ? mDirectSpending
        : monthDeposits.filter((d) => d.profile_id === member.id).reduce((sum, d) => sum + Number(d.amount || 0), 0);

      const mBalance = isPayAsYouGo
        ? mDirectSpending - mTotalCostShare
        : (mDeposited + mDirectSpending) - mTotalCostShare;

      const settledRow = monthSettlements.find((s) => s.profile_id === member.id && s.status === "settled");

      return {
        profile: member,
        meals: mMeals,
        deposited: mDeposited,
        directSpending: mDirectSpending,
        totalCostShare: mTotalCostShare,
        balance: mBalance,
        isSettled: mBalance >= -0.01 ? true : !!settledRow,
      };
    });

    const isMonthSettled = rows.every((r) => r.isSettled);

    return {
      ...mItem,
      isMonthSettled,
      summary: {
        rows,
        totalMealCost,
        totalOtherCost,
        mealRate: totalMeals > 0 ? totalMealCost / totalMeals : 0,
      }
    };
  });

  const activeMonthData = monthsWithCalculatedStatus.find((m) => m.key === selectedMonthKey);
  const isSuperAdmin = profile?.role === "super_admin";

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden bg-zinc-950 text-zinc-50 font-sans">
      {/* Left Sidebar: Completed Months List */}
      <div className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-zinc-900 overflow-y-auto p-4 shrink-0 flex flex-col gap-2">
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Completed Months</span>
        {monthsWithCalculatedStatus.length === 0 ? (
          <p className="text-zinc-500 text-xs italic">No past completed months found.</p>
        ) : (
          monthsWithCalculatedStatus.map((mItem) => {
            const monthName = months.find((m) => m.value === mItem.month)?.name || mItem.month;
            const isSelected = mItem.key === selectedMonthKey;
            return (
              <button
                key={mItem.key}
                onClick={() => setSelectedMonthKey(mItem.key)}
                className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between transition-colors ${
                  isSelected ? "bg-zinc-900 text-white font-semibold" : "hover:bg-zinc-900/40 text-zinc-400"
                }`}
              >
                <span className="truncate">{monthName} {mItem.year}</span>
                <span className={`w-2.5 h-2.5 rounded-full ${mItem.isMonthSettled ? "bg-emerald-500" : "bg-red-500 animate-pulse"}`} />
              </button>
            );
          })
        )}
      </div>

      {/* Right Content Panel: Selected Month Details */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {activeMonthData ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4">
                <span className="text-xs text-zinc-500 font-semibold uppercase font-sans">Total Meal Cost</span>
                <p className="text-xl font-bold mt-1 text-white">{activeMonthData.summary.totalMealCost.toFixed(2)} TK</p>
              </div>
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4">
                <span className="text-xs text-zinc-500 font-semibold uppercase font-sans">Overall Meal Rate</span>
                <p className="text-xl font-bold mt-1 text-indigo-400">{activeMonthData.summary.mealRate.toFixed(4)} TK/meal</p>
              </div>
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4">
                <span className="text-xs text-zinc-500 font-semibold uppercase font-sans">Settlement Status</span>
                <p className="text-xl font-bold mt-1 flex items-center gap-2">
                  <span className={`w-3.5 h-3.5 rounded-full ${activeMonthData.isMonthSettled ? "bg-emerald-500" : "bg-red-500"}`} />
                  <span className={activeMonthData.isMonthSettled ? "text-emerald-400" : "text-red-400"}>
                    {activeMonthData.isMonthSettled ? "Fully Settled" : "Unsettled Dues"}
                  </span>
                </p>
              </div>
            </div>

            {/* Members Ledger */}
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 bg-zinc-900/60 border-b border-zinc-800">
                <h3 className="font-semibold text-zinc-200">Balance Ledger</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm text-zinc-300">
                  <thead className="bg-zinc-950/80 text-xs text-zinc-400 border-b border-zinc-800 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3.5">Name</th>
                      <th className="px-4 py-3.5">Spending / Deposit</th>
                      <th className="px-4 py-3.5">Total Share</th>
                      <th className="px-4 py-3.5">Net Balance</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/40">
                    {activeMonthData.summary.rows.map((row: any) => {
                      const showSettleButton = row.balance < -0.01 && !row.isSettled;
                      return (
                        <tr key={row.profile.id} className="hover:bg-zinc-900/10 transition-colors">
                          <td className="px-4 py-4 font-bold text-white whitespace-nowrap">
                            {row.profile.full_name || row.profile.email}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            {(row.deposited + row.directSpending).toFixed(2)} TK
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            {row.totalCostShare.toFixed(2)} TK
                          </td>
                          <td className={`px-4 py-4 font-bold whitespace-nowrap ${row.balance >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {row.balance >= 0 ? "+" : ""}
                            {row.balance.toFixed(2)} TK
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            {row.isSettled ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                ✓ Settled / Cleared
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                                ⚠ Unpaid Due
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-right whitespace-nowrap">
                            {showSettleButton ? (
                              isSuperAdmin ? (
                                <button
                                  onClick={() => handleSettleDue(row.profile.id, activeMonthData.year, activeMonthData.month)}
                                  disabled={settlingId === row.profile.id}
                                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
                                >
                                  {settlingId === row.profile.id ? "Settling..." : "Mark as Paid"}
                                </button>
                              ) : (
                                <span className="text-zinc-500 text-xs italic">Only admin can settle</span>
                              )
                            ) : (
                              <span className="text-zinc-500 text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-16 text-zinc-500 italic">
            No historical data available. Dues track here once a month completes.
          </div>
        )}
      </div>
    </div>
  );
}
