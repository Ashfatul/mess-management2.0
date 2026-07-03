"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function MealsPage() {
  const [profile, setProfile] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  
  // Daily log states
  const [dailyCounts, setDailyCounts] = useState<{ [profileId: string]: number }>({});
  
  // Monthly overview state
  const [monthlyMeals, setMonthlyMeals] = useState<any[]>([]);
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

  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month, 0).getDate();
  };

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

      // Fetch mess members
      const { data: membersData } = await supabase
        .from("profiles")
        .select("*")
        .eq("mess_id", profileData.mess_id);
      
      const activeMembers = membersData || [];
      setMembers(activeMembers);

      // Fetch all monthly meals to construct monthly table
      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;
      const lastDay = getDaysInMonth(selectedMonth, selectedYear);
      const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${lastDay}`;

      const { data: mealsData } = await supabase
        .from("meals")
        .select("*")
        .gte("date", startDate)
        .lte("date", endDate);
      
      setMonthlyMeals(mealsData || []);

      // Initialize daily logger counts for the selectedDate
      const { data: dailyMealsData } = await supabase
        .from("meals")
        .select("*")
        .eq("date", selectedDate);

      const initialCounts: { [profileId: string]: number } = {};
      activeMembers.forEach((member: any) => {
        const found = dailyMealsData?.find((m: any) => m.profile_id === member.id);
        initialCounts[member.id] = found ? Number(found.count) : 0;
      });
      setDailyCounts(initialCounts);

      setLoading(false);
    };

    fetchData();
  }, [selectedMonth, selectedYear, selectedDate]);

  // Update counts in daily logger
  const handleCountChange = (profileId: string, value: number) => {
    if (value < 0) return;
    setDailyCounts((prev) => ({
      ...prev,
      [profileId]: value,
    }));
  };

  const handleSaveDailyMeals = async () => {
    setSaving(true);
    setStatusMsg("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Prepare bulk upserts
      const upsertData = members.map((member) => ({
        profile_id: member.id,
        date: selectedDate,
        count: dailyCounts[member.id] || 0,
        added_by: session.user.id,
      }));

      const { error } = await supabase
        .from("meals")
        .upsert(upsertData, { onConflict: "profile_id, date" });

      if (error) throw error;

      setStatusMsg("Meals saved successfully!");
      
      // Refresh monthly overview meals
      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;
      const lastDay = getDaysInMonth(selectedMonth, selectedYear);
      const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${lastDay}`;
      const { data: mealsData } = await supabase
        .from("meals")
        .select("*")
        .gte("date", startDate)
        .lte("date", endDate);
      setMonthlyMeals(mealsData || []);

      setTimeout(() => setStatusMsg(""), 3000);
    } catch (err: any) {
      console.error(err);
      setStatusMsg("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center bg-zinc-950 text-zinc-50 py-24 gap-4">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-300 text-sm font-medium">Loading Meal Ledger...</p>
      </div>
    );
  }

  const daysInMonth = getDaysInMonth(selectedMonth, selectedYear);
  const dayRows = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="flex-1 p-6 md:p-8 space-y-8 bg-zinc-950 text-zinc-50 font-sans text-sm md:text-base">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">Meal Log</h1>
          <p className="text-xs md:text-sm text-zinc-400">Record daily meal counts and view monthly registers</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: Quick Daily Logger */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 space-y-6 backdrop-blur">
          <div>
            <h2 className="text-base font-semibold text-zinc-200">Log Daily Meals</h2>
            <p className="text-xs text-zinc-500">Record meal counts for all members on a specific day</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5 font-medium">Select Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-zinc-950/80 border border-zinc-800 px-3.5 py-2.5 rounded-lg text-zinc-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
              />
            </div>

            <div className="border-t border-zinc-800/80 pt-4 space-y-3.5">
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between">
                  <span className="text-sm text-zinc-200 font-bold">{member.full_name || "Unnamed"}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleCountChange(member.id, Math.max(0, (dailyCounts[member.id] || 0) - 0.5))}
                      className="w-9 h-9 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-950/60 flex items-center justify-center text-zinc-300 hover:text-white transition-colors text-lg font-bold"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={dailyCounts[member.id] || 0}
                      onChange={(e) => handleCountChange(member.id, Number(e.target.value))}
                      className="w-14 text-center bg-zinc-950/80 border border-zinc-800 py-1.5 px-1 rounded-md text-sm font-bold text-white focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      onClick={() => handleCountChange(member.id, (dailyCounts[member.id] || 0) + 0.5)}
                      className="w-9 h-9 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-950/60 flex items-center justify-center text-zinc-300 hover:text-white transition-colors text-lg font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {statusMsg && (
              <p className={`text-xs ${statusMsg.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}>
                {statusMsg}
              </p>
            )}

            <button
              onClick={handleSaveDailyMeals}
              disabled={saving}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-sm shadow-md transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : `Save Meals for ${selectedDate}`}
            </button>
          </div>
        </div>

        {/* Right Column: Monthly Grid */}
        <div className="lg:col-span-2 bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden backdrop-blur flex flex-col h-[560px]">
          <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/55 flex justify-between items-center shrink-0">
            <div>
              <h2 className="font-semibold text-sm md:text-base text-zinc-200">Monthly Ledger Overview</h2>
              <p className="text-xs text-zinc-500">Overview of active meals per day</p>
            </div>

            {/* Month selector */}
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
                  <th className="px-4 py-3 bg-zinc-950">Day</th>
                  {members.map((m) => (
                    <th key={m.id} className="px-4 py-3 min-w-[90px]">
                      {m.full_name || "Unnamed"}
                    </th>
                  ))}
                  <th className="px-4 py-3 font-bold bg-zinc-950">Daily Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {dayRows.map((day) => {
                  const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  let dailySum = 0;
                  return (
                    <tr key={day} className="hover:bg-zinc-900/10 transition-colors">
                      <td className="px-4 py-2.5 font-bold text-zinc-400 bg-zinc-950/30">{day}</td>
                      {members.map((m) => {
                        const cellMeal = monthlyMeals.find((meal) => meal.profile_id === m.id && meal.date === dateStr);
                        const countVal = cellMeal ? Number(cellMeal.count) : 0;
                        dailySum += countVal;
                        return (
                          <td key={m.id} className="px-4 py-2.5 font-semibold">
                            {countVal > 0 ? (
                              <span className="text-zinc-200">{countVal}</span>
                            ) : (
                              <span className="text-zinc-700">-</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2.5 font-bold text-indigo-400 bg-zinc-950/30">
                        {dailySum > 0 ? dailySum : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-zinc-950/80 font-bold border-t border-zinc-800 uppercase text-xs tracking-wider sticky bottom-0 z-10">
                <tr>
                  <td className="px-4 py-3">Total</td>
                  {members.map((m) => {
                    const memberTotal = monthlyMeals
                      .filter((meal) => meal.profile_id === m.id)
                      .reduce((sum, meal) => sum + Number(meal.count || 0), 0);
                    return (
                      <td key={m.id} className="px-4 py-3 text-white text-base">
                        {memberTotal}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-indigo-400 text-base">
                    {monthlyMeals.reduce((sum, meal) => sum + Number(meal.count || 0), 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
