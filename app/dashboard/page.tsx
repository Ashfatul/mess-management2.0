"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function DashboardPage() {
  const [profile, setProfile] = useState<any>(null);
  const [mess, setMess] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1); // 1-12
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [meals, setMeals] = useState<any[]>([]);
  const [costs, setCosts] = useState<any[]>([]);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // View context state (overall vs specific user ID)
  const [viewContext, setViewContext] = useState("overall");

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
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

  useEffect(() => {
    const fetchData = async () => {
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

      // Fetch mess details
      const { data: messData } = await supabase
        .from("messes")
        .select("*")
        .eq("id", profileData.mess_id)
        .single();
      if (messData) setMess(messData);

      const { data: membersData } = await supabase
        .from("profiles")
        .select("*")
        .eq("mess_id", profileData.mess_id);

      const activeMembers = membersData || [];
      setMembers(activeMembers);

      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;
      const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
      const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${lastDay}`;

      const { data: mealsData } = await supabase
        .from("meals")
        .select("*")
        .gte("date", startDate)
        .lte("date", endDate);
      setMeals(mealsData || []);

      const { data: costsData } = await supabase
        .from("costs")
        .select("*")
        .gte("date", startDate)
        .lte("date", endDate);
      setCosts(costsData || []);

      const { data: depositsData } = await supabase
        .from("deposits")
        .select("*")
        .gte("date", startDate)
        .lte("date", endDate);
      setDeposits(depositsData || []);

      setLoading(false);
    };

    fetchData();
  }, [selectedMonth, selectedYear]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center bg-zinc-950 text-zinc-50 py-24 gap-4">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-300 text-sm font-medium">Calculating sheet formulas...</p>
      </div>
    );
  }

  // --- Calculations ---
  const memberCount = members.length || 1;
  const isPayAsYouGo = mess?.deposit_mode === "pay_as_you_go";

  // Meal Rate Calculations
  const totalMeals = meals.reduce((sum, m) => sum + Number(m.count || 0), 0);
  const totalMealBazarCost = costs
    .filter((c) => c.cost_category === "meal_bazar")
    .reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const totalGlobalBazarCost = costs
    .filter((c) => c.cost_category === "global_bazar")
    .reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const totalMealCost = totalMealBazarCost + totalGlobalBazarCost;
  const mealRate = totalMeals > 0 ? totalMealBazarCost / totalMeals : 0;

  // Total Other Cost Calculations
  const totalOtherCost = costs
    .filter((c) => c.cost_category !== "meal_bazar" && c.cost_category !== "global_bazar")
    .reduce((sum, c) => sum + Number(c.amount || 0), 0);

  // Deposits & Balance Calculations
  const loggedDepositsSum = deposits.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  const totalDeposits = isPayAsYouGo ? totalMealCost + totalOtherCost : loggedDepositsSum;
  const currentBalance = isPayAsYouGo ? 0.0 : totalDeposits - totalMealCost - totalOtherCost;

  // Map individual details for the members table
  const summaryRows = members.map((m) => {
    const mMeals = meals
      .filter((meal) => meal.profile_id === m.id)
      .reduce((sum, meal) => sum + Number(meal.count || 0), 0);

    const mMealCostShare = mMeals * mealRate;

    const mOtherCostShare = costs
      .filter((c) => c.cost_category !== "meal_bazar" && c.cost_category !== "global_bazar")
      .reduce((sum, c) => sum + (Number(c.amount || 0) / memberCount), 0);

    const mTotalCostShare = mMealCostShare + mOtherCostShare;

    const mDirectSpending = costs
      .reduce((sum, c) => {
        if (c.profile_id === m.id) {
          // Sole spender
          return sum + Number(c.amount || 0);
        } else if (c.profile_id === null) {
          // Shared spender (multiple people paid collectively)
          if (c.shared_by) {
            if (Array.isArray(c.shared_by)) {
              // Paid equally by a subset of members
              if (c.shared_by.includes(m.id)) {
                return sum + (Number(c.amount || 0) / c.shared_by.length);
              }
            } else {
              // Custom amounts paid by members
              if (c.shared_by[m.id] !== undefined) {
                return sum + Number(c.shared_by[m.id] || 0);
              }
            }
          } else {
            // Paid equally by everyone (shared_by is null)
            return sum + (Number(c.amount || 0) / memberCount);
          }
        }
        return sum;
      }, 0);

    // If pay_as_you_go: deposit counts as direct spending
    const mDeposited = isPayAsYouGo 
      ? mDirectSpending 
      : deposits.filter((d) => d.profile_id === m.id).reduce((sum, d) => sum + Number(d.amount || 0), 0);

    // Net Balance calculation
    const mBalance = isPayAsYouGo
      ? mDirectSpending - mTotalCostShare
      : (mDeposited + mDirectSpending) - mTotalCostShare;

    let status = "Settlement";
    if (mBalance < -0.01) {
      status = "You have to pay";
    } else if (mBalance > 0.01) {
      status = "You will get paid";
    }

    return {
      profile: m,
      meals: mMeals,
      mealCostShare: mMealCostShare,
      otherCostShare: mOtherCostShare,
      deposited: mDeposited,
      directSpending: mDirectSpending,
      balance: mBalance,
      status,
    };
  });

  // Determine current card details based on selected viewContext
  let cardTitleDeposit = isPayAsYouGo ? "Total Spending (As Deposit)" : "Total Deposit";
  let cardTitleMealCost = "Total Meal Cost";
  let cardTitleOtherCost = "Total Other Cost";
  let cardTitleBalance = "Current Balance";

  let displayDeposit = totalDeposits;
  let displayMealCost = totalMealCost;
  let displayOtherCost = totalOtherCost;
  let displayBalance = currentBalance;
  let isBalancePositive = currentBalance >= 0;

  const currentViewMember = members.find((m) => m.id === viewContext);

  if (viewContext !== "overall" && currentViewMember) {
    const memberSummary = summaryRows.find((row) => row.profile.id === viewContext);
    if (memberSummary) {
      cardTitleDeposit = isPayAsYouGo ? `${currentViewMember.full_name}'s Spending` : `${currentViewMember.full_name}'s Deposits`;
      cardTitleMealCost = `${currentViewMember.full_name}'s Meal Share`;
      cardTitleOtherCost = `${currentViewMember.full_name}'s Other Share`;
      cardTitleBalance = `${currentViewMember.full_name}'s Net Balance`;

      displayDeposit = memberSummary.deposited;
      displayMealCost = memberSummary.mealCostShare;
      displayOtherCost = memberSummary.otherCostShare;
      displayBalance = memberSummary.balance;
      isBalancePositive = memberSummary.balance >= 0;
    }
  }

  const isSuperAdmin = profile?.role === "super_admin";
  const selectOptions = isSuperAdmin 
    ? members 
    : members.filter((m) => m.id === profile?.id);

  // --- Calendar Math ---
  const firstDayIndex = new Date(selectedYear, selectedMonth - 1, 1).getDay(); // Starting weekday (0 = Sun, 1 = Mon...)
  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const calendarCells = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const getCalendarDayMeta = (dayNum: number) => {
    const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    const dayMeals = meals.filter((meal) => meal.date === dateStr);
    const dayMealsSum = dayMeals.reduce((sum, meal) => sum + Number(meal.count || 0), 0);
    const hasHistory = dayMeals.length > 0 && dayMealsSum > 0;

    const cellDate = new Date(selectedYear, selectedMonth - 1, dayNum);
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const isFuture = cellDate > todayDate;

    return { hasHistory, isFuture, dayMealsSum };
  };

  return (
    <div className="flex-1 bg-zinc-950 text-zinc-50 relative text-sm md:text-base flex flex-col h-full overflow-hidden">
      {/* Sticky Upper Action Bar */}
      <div className="sticky top-0 z-20 bg-zinc-950/80 backdrop-blur-md px-4 py-4 sm:px-6 md:px-8 sm:py-6 border-b border-zinc-900 shrink-0 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-white">
              {viewContext === "overall" ? "Overall Mess Summary" : `${currentViewMember?.full_name}'s Personal Status`}
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400">
              {viewContext === "overall"
                ? "Viewing summary and balances for the entire mess fund"
                : `Viewing individual ledger statements for ${currentViewMember?.full_name}`}
            </p>
          </div>
        </div>

        {/* View Scope & Month / Year Selector */}
        <div className="flex flex-wrap gap-2 items-center bg-zinc-900/60 p-1.5 rounded-xl border border-zinc-800 w-full sm:w-auto sm:self-end">
          {/* View Selector */}
          <div className="flex items-center gap-1.5 border-r border-zinc-800 pr-2 min-w-0">
            <span className="hidden sm:inline text-[10px] text-zinc-500 font-bold uppercase pl-1.5">View:</span>
            <select
              value={viewContext}
              onChange={(e) => setViewContext(e.target.value)}
              className="bg-transparent text-xs sm:text-sm border-0 focus:ring-0 text-white py-1 px-2 sm:px-3.5 rounded-lg hover:bg-zinc-800 cursor-pointer font-bold pr-7 sm:pr-8 appearance-none max-w-[160px] sm:max-w-none"
            >
              <option value="overall" className="bg-zinc-900 text-white font-bold">Overall Mess Status</option>
              {selectOptions.map((m) => (
                <option key={m.id} value={m.id} className="bg-zinc-900 text-white">
                  {m.id === profile?.id ? "My Personal Status" : m.full_name}
                </option>
              ))}
            </select>
          </div>

          {/* Month/Year selector */}
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="bg-transparent text-xs sm:text-sm border-0 focus:ring-0 text-zinc-200 py-1.5 px-2 sm:px-3 rounded-lg hover:bg-zinc-800 cursor-pointer pr-7 sm:pr-8 appearance-none"
          >
            {months.map((m) => (
              <option key={m.value} value={m.value} className="bg-zinc-900 text-zinc-200">
                {m.name}
              </option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="bg-transparent text-xs sm:text-sm border-0 focus:ring-0 text-zinc-200 py-1.5 px-2 sm:px-3 rounded-lg hover:bg-zinc-800 cursor-pointer pr-7 sm:pr-8 appearance-none"
          >
            {years.map((y) => (
              <option key={y} value={y} className="bg-zinc-900 text-zinc-200">
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Scrollable Page Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-zinc-900/50 border border-zinc-800 p-4 sm:p-5 rounded-2xl backdrop-blur flex flex-col justify-between gap-2">
            <span className="text-[11px] sm:text-xs md:text-sm text-zinc-400 font-medium leading-snug">{cardTitleDeposit}</span>
            <h3 className="text-lg sm:text-xl md:text-3xl font-bold text-white break-words">
              {displayDeposit.toLocaleString()} <span className="text-[10px] sm:text-xs md:text-sm font-normal text-zinc-500">TK</span>
            </h3>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 p-4 sm:p-5 rounded-2xl backdrop-blur flex flex-col justify-between gap-2">
            <span className="text-[11px] sm:text-xs md:text-sm text-zinc-400 font-medium leading-snug">{cardTitleMealCost}</span>
            <h3 className="text-lg sm:text-xl md:text-3xl font-bold text-white break-words">
              {displayMealCost.toLocaleString()} <span className="text-[10px] sm:text-xs md:text-sm font-normal text-zinc-500">TK</span>
            </h3>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 p-4 sm:p-5 rounded-2xl backdrop-blur flex flex-col justify-between gap-2">
            <span className="text-[11px] sm:text-xs md:text-sm text-zinc-400 font-medium leading-snug">{cardTitleOtherCost}</span>
            <h3 className="text-lg sm:text-xl md:text-3xl font-bold text-white break-words">
              {displayOtherCost.toLocaleString()} <span className="text-[10px] sm:text-xs md:text-sm font-normal text-zinc-500">TK</span>
            </h3>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 p-4 sm:p-5 rounded-2xl backdrop-blur flex flex-col justify-between gap-2">
            <span className="text-[11px] sm:text-xs md:text-sm text-zinc-400 font-medium leading-snug">{cardTitleBalance}</span>
            <h3 className={`text-lg sm:text-xl md:text-3xl font-bold break-words ${isBalancePositive ? "text-emerald-400" : "text-red-400"}`}>
              {displayBalance.toLocaleString()} <span className="text-[10px] sm:text-xs md:text-sm font-normal text-zinc-500">TK</span>
            </h3>
          </div>
        </div>

        {/* Calculations details card (Full Width) */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden backdrop-blur">
          <div className="px-4 sm:px-6 py-4 border-b border-zinc-800 bg-zinc-900/55 flex flex-col sm:flex-row gap-2 sm:gap-3 justify-between sm:items-center">
            <h2 className="font-semibold text-sm md:text-base text-zinc-200">Calculation Constants</h2>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs md:text-sm text-zinc-400 font-sans">
              <div>
                Total Meals: <span className="text-white font-medium">{totalMeals}</span>
              </div>
              <div>
                Meal Rate: <span className="text-indigo-400 font-semibold">{mealRate.toFixed(2)} TK</span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-zinc-300 min-w-[640px]">
              <thead className="bg-zinc-950/50 text-xs text-zinc-400 border-b border-zinc-800 uppercase tracking-wider">
                <tr>
                  <th className="px-4 sm:px-6 py-3.5">Name</th>
                  <th className="px-4 sm:px-6 py-3.5">Meal Count</th>
                  <th className="px-4 sm:px-6 py-3.5 font-sans">{isPayAsYouGo ? "Contribution" : "Deposited"}</th>
                  <th className="px-4 sm:px-6 py-3.5">Meal Cost Share</th>
                  <th className="px-4 sm:px-6 py-3.5">Utilities Share</th>
                  <th className="px-4 sm:px-6 py-3.5">Your Spending</th>
                  <th className="px-4 sm:px-6 py-3.5">Net Balance</th>
                  <th className="px-4 sm:px-6 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {summaryRows.map((row) => {
                  const isSelectedRow = row.profile.id === viewContext;
                  return (
                    <tr
                      key={row.profile.id}
                      className={`hover:bg-zinc-900/20 transition-colors text-sm md:text-base ${
                        isSelectedRow ? "bg-indigo-950/30 border-l-4 border-l-indigo-500" : ""
                      }`}
                    >
                      <td className="px-4 sm:px-6 py-4 font-bold text-white">
                        {row.profile.full_name || "Unnamed"}
                        {row.profile.id === profile?.id && <span className="text-xs text-indigo-400 font-normal ml-1.5 font-sans">(You)</span>}
                      </td>
                      <td className="px-4 sm:px-6 py-4 font-semibold text-zinc-300">{row.meals}</td>
                      <td className="px-4 sm:px-6 py-4 font-semibold text-indigo-400 whitespace-nowrap">{row.deposited.toFixed(2)} TK</td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap">{row.mealCostShare.toFixed(2)} TK</td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap">{row.otherCostShare.toFixed(2)} TK</td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap">{row.directSpending.toFixed(2)} TK</td>
                      <td className={`px-4 sm:px-6 py-4 font-bold whitespace-nowrap ${row.balance >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {row.balance >= 0 ? "+" : ""}
                        {row.balance.toFixed(2)} TK
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
                            row.status === "You will get paid"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : row.status === "You have to pay"
                              ? "bg-red-500/10 text-red-400 border border-red-500/20"
                              : "bg-zinc-800 text-zinc-300"
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom Panel Grid (50% Calendar Tracker, 50% Explanation Notes) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 items-stretch">
          {/* Meal logging calendar tracker */}
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 sm:p-5 space-y-4 backdrop-blur flex flex-col justify-between">
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-zinc-200 font-sans">Meal Logs Tracker</h2>
                <p className="text-xs text-zinc-500 font-sans">Monthly calendar checking visual filled status</p>
              </div>

              {/* Calendar Grid Header Days */}
              <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center text-[9px] sm:text-[10px] font-bold uppercase text-zinc-500 font-sans tracking-wide">
                <span>Su</span>
                <span>Mo</span>
                <span>Tu</span>
                <span>We</span>
                <span>Th</span>
                <span>Fr</span>
                <span>Sa</span>
              </div>

              {/* Days Grid */}
              <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                {/* Spacers for the start of the week */}
                {Array.from({ length: firstDayIndex }).map((_, i) => (
                  <div key={`spacer-${i}`} className="aspect-square bg-transparent" />
                ))}

                {/* Day cells */}
                {calendarCells.map((day) => {
                  const { hasHistory, isFuture, dayMealsSum } = getCalendarDayMeta(day);

                  // Color codes
                  let cellClass = "bg-zinc-900/20 text-zinc-600 border border-zinc-900/60"; // Future
                  if (!isFuture) {
                    if (hasHistory) {
                      cellClass = "bg-emerald-950/40 text-emerald-400 border border-emerald-800/40 hover:bg-emerald-900/50";
                    } else {
                      cellClass = "bg-rose-950/40 text-rose-400 border border-rose-800/40 hover:bg-rose-900/50";
                    }
                  }

                  return (
                    <div
                      key={day}
                      title={
                        isFuture
                          ? `Day ${day} (Future)`
                          : hasHistory
                          ? `Day ${day}: ${dayMealsSum} total meals logged`
                          : `Day ${day}: No meal logs added!`
                      }
                      className={`aspect-square rounded-md sm:rounded-lg flex items-center justify-center text-[10px] sm:text-xs font-bold font-sans cursor-pointer transition-colors shadow-sm ${cellClass}`}
                    >
                      {day}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Calendar Legend indicators */}
            <div className="pt-3 border-t border-zinc-800/60 flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-500 font-sans font-medium">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-emerald-950/40 border border-emerald-800/40 inline-block" />
                <span>Logged</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-rose-950/40 border border-rose-800/40 inline-block" />
                <span>Missing</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-zinc-900/20 border border-zinc-900/60 inline-block" />
                <span>Future</span>
              </div>
            </div>
          </div>

          {/* Helpful Instructions */}
          <div className="p-4 sm:p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 text-xs md:text-sm text-zinc-400 space-y-4 flex flex-col justify-between">
            <div className="space-y-3.5">
              <p className="text-base font-semibold text-zinc-200 font-sans">💡 Calculation Notes & Formulas</p>
              <div className="space-y-2 text-zinc-400">
                <p>• <span className="font-semibold text-white">Meal Rate</span> = Total Meal Cost / Total Meal Count.</p>
                <p>• <span className="font-semibold text-white">Utilities Share</span> = Calculated per transaction. Divided equally only among the members selected for that cost (custom splits), otherwise divided equally among all members.</p>
                <p>• <span className="font-semibold text-white">Your Spending</span> represents all items you purchased directly on behalf of the mess using your own money.</p>
                <p>
                  {isPayAsYouGo
                    ? "• • Net Balance = Your Spending - Meal Cost Share - Utilities Share. Positive balance means you will get paid back; negative means you have to pay the manager."
                    : "• • Net Balance = (Deposited + Your Spending) - Meal Cost Share - Utilities Share. Positive balance means you will get paid back; negative means you have to pay the manager."}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-950/40 border border-zinc-800/60 text-zinc-500 text-[11px] leading-relaxed">
              <span className="font-bold text-zinc-400 block mb-1">🏦 Contribution Model active:</span>
              {isPayAsYouGo
                ? "Pay-as-you-go model. Out-of-pocket purchases count directly as deposits. No separate advance deposit entries are expected or required to balance sheets."
                : "Prepaid fund model. Members make advance deposits to the manager. Net balance reflects cash deposits plus purchases minus consumption shares."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
