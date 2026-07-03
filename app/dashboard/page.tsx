"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function DashboardPage() {
  const [profile, setProfile] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1); // 1-12
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [meals, setMeals] = useState<any[]>([]);
  const [costs, setCosts] = useState<any[]>([]);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Available years for dropdown
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

      // 1. Get current user profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (!profileData || !profileData.mess_id) return;
      setProfile(profileData);

      // 2. Fetch all members in the same mess
      const { data: membersData } = await supabase
        .from("profiles")
        .select("*")
        .eq("mess_id", profileData.mess_id);

      const activeMembers = membersData || [];
      setMembers(activeMembers);

      // 3. Define date range for filtering (start of month to end of month)
      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;
      const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
      const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${lastDay}`;

      // 4. Fetch meals
      const { data: mealsData } = await supabase
        .from("meals")
        .select("*")
        .gte("date", startDate)
        .lte("date", endDate);
      setMeals(mealsData || []);

      // 5. Fetch costs
      const { data: costsData } = await supabase
        .from("costs")
        .select("*")
        .gte("date", startDate)
        .lte("date", endDate);
      setCosts(costsData || []);

      // 6. Fetch deposits
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

  // Meal Rate Calculations
  const totalMeals = meals.reduce((sum, m) => sum + Number(m.count || 0), 0);
  const totalMealCost = costs
    .filter((c) => c.cost_category === "meal_bazar")
    .reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const mealRate = totalMeals > 0 ? totalMealCost / totalMeals : 0;

  // Total Other Cost Calculations
  const totalOtherCost = costs
    .filter((c) => c.cost_category !== "meal_bazar")
    .reduce((sum, c) => sum + Number(c.amount || 0), 0);

  // Deposits & Balance Calculations
  const totalDeposits = deposits.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  const currentBalance = totalDeposits - totalMealCost - totalOtherCost;

  // Map individual details
  const summaryRows = members.map((m) => {
    // 1. Individual meal count
    const mMeals = meals
      .filter((meal) => meal.profile_id === m.id)
      .reduce((sum, meal) => sum + Number(meal.count || 0), 0);

    // 2. Individual meal cost share
    const mMealCostShare = mMeals * mealRate;

    // 3. Individual other cost share (dividing custom split or equally)
    let mOtherCostShare = 0;
    costs
      .filter((c) => c.cost_category !== "meal_bazar")
      .forEach((c) => {
        if (c.shared_by && c.shared_by.length > 0) {
          if (c.shared_by.includes(m.id)) {
            mOtherCostShare += Number(c.amount) / c.shared_by.length;
          }
        } else {
          mOtherCostShare += Number(c.amount) / memberCount;
        }
      });

    // 4. Individual total cost share
    const mTotalCostShare = mMealCostShare + mOtherCostShare;

    // 5. Individual direct spending (what they bought / paid out of pocket)
    const mDirectSpending = costs
      .filter((c) => c.profile_id === m.id)
      .reduce((sum, c) => sum + Number(c.amount || 0), 0);

    // 6. Net balance
    const mBalance = mDirectSpending - mTotalCostShare;

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
      directSpending: mDirectSpending,
      balance: mBalance,
      status,
    };
  });

  return (
    <div className="flex-1 p-6 md:p-8 space-y-8 bg-zinc-950 text-zinc-50 relative text-sm md:text-base">
      {/* Upper Action Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">Summary & Status</h1>
          <p className="text-xs md:text-sm text-zinc-400">Manage and view the mess calculations at a glance</p>
        </div>

        {/* Month / Year Selector */}
        <div className="flex gap-2 bg-zinc-900/60 p-1.5 rounded-xl border border-zinc-800 backdrop-blur">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="bg-transparent text-sm border-0 focus:ring-0 text-zinc-200 py-1.5 px-3 rounded-lg hover:bg-zinc-800 cursor-pointer pr-8 appearance-none"
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
            className="bg-transparent text-sm border-0 focus:ring-0 text-zinc-200 py-1.5 px-3 rounded-lg hover:bg-zinc-800 cursor-pointer pr-8 appearance-none"
          >
            {years.map((y) => (
              <option key={y} value={y} className="bg-zinc-900 text-zinc-200">
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-2xl backdrop-blur flex flex-col justify-between">
          <span className="text-xs md:text-sm text-zinc-400 font-medium">Total Deposit</span>
          <h3 className="text-xl md:text-3xl font-bold text-white mt-2">
            {totalDeposits.toLocaleString()} <span className="text-xs md:text-sm font-normal text-zinc-500">TK</span>
          </h3>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-2xl backdrop-blur flex flex-col justify-between">
          <span className="text-xs md:text-sm text-zinc-400 font-medium">Total Meal Cost</span>
          <h3 className="text-xl md:text-3xl font-bold text-white mt-2">
            {totalMealCost.toLocaleString()} <span className="text-xs md:text-sm font-normal text-zinc-500">TK</span>
          </h3>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-2xl backdrop-blur flex flex-col justify-between">
          <span className="text-xs md:text-sm text-zinc-400 font-medium">Total Other Cost</span>
          <h3 className="text-xl md:text-3xl font-bold text-white mt-2">
            {totalOtherCost.toLocaleString()} <span className="text-xs md:text-sm font-normal text-zinc-500">TK</span>
          </h3>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-2xl backdrop-blur flex flex-col justify-between">
          <span className="text-xs md:text-sm text-zinc-400 font-medium">Current Balance</span>
          <h3 className={`text-xl md:text-3xl font-bold mt-2 ${currentBalance >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {currentBalance.toLocaleString()} <span className="text-xs md:text-sm font-normal text-zinc-500">TK</span>
          </h3>
        </div>
      </div>

      {/* Calculations Details Card */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden backdrop-blur">
        <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/55 flex flex-col sm:flex-row gap-2 justify-between sm:items-center">
          <h2 className="font-semibold text-sm md:text-base text-zinc-200">Calculation Constants</h2>
          <div className="flex gap-4 text-xs md:text-sm text-zinc-400">
            <div>
              Total Meals: <span className="text-white font-medium">{totalMeals}</span>
            </div>
            <div>
              Meal Rate: <span className="text-indigo-400 font-semibold">{mealRate.toFixed(2)} TK</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-300">
            <thead className="bg-zinc-950/50 text-xs text-zinc-400 border-b border-zinc-800 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Name</th>
                <th className="px-6 py-3.5">Meal Count</th>
                <th className="px-6 py-3.5">Meal Cost Share</th>
                <th className="px-6 py-3.5">Utilities Share</th>
                <th className="px-6 py-3.5">Your Spending</th>
                <th className="px-6 py-3.5">Net Balance</th>
                <th className="px-6 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {summaryRows.map((row) => (
                <tr key={row.profile.id} className="hover:bg-zinc-900/20 transition-colors text-sm md:text-base">
                  <td className="px-6 py-4 font-bold text-white">{row.profile.full_name || "Unnamed"}</td>
                  <td className="px-6 py-4 font-semibold text-zinc-300">{row.meals}</td>
                  <td className="px-6 py-4">{row.mealCostShare.toFixed(2)} TK</td>
                  <td className="px-6 py-4">{row.otherCostShare.toFixed(2)} TK</td>
                  <td className="px-6 py-4">{row.directSpending.toFixed(2)} TK</td>
                  <td className={`px-6 py-4 font-bold ${row.balance >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {row.balance >= 0 ? "+" : ""}
                    {row.balance.toFixed(2)} TK
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
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
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Helpful Instructions */}
      <div className="p-5 rounded-xl bg-zinc-900/20 border border-zinc-800 text-xs md:text-sm text-zinc-500 space-y-1.5">
        <p className="font-semibold text-zinc-400">💡 Calculation Notes:</p>
        <p>• Meal Rate = Total Meal Cost / Total Meal Count.</p>
        <p>• Utilities Share = Calculated per transaction. Divided equally only among the members selected for that cost (custom splits), otherwise divided equally among all members.</p>
        <p>• Your Spending represents all items you purchased directly on behalf of the mess using your own money.</p>
        <p>• Net Balance = Your Spending - Meal Cost Share - Utilities Share. Positive balance means you will get paid back; negative means you have to pay the manager.</p>
      </div>
    </div>
  );
}
