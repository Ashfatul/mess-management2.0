"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  fetchMonthlyStatus,
  disabledIdsFor,
  MemberMonthStatusRow,
} from "@/lib/membership";

export default function AvailabilityPage() {
  const [profile, setProfile] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Monthly availability management
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [monthlyStatus, setMonthlyStatus] = useState<MemberMonthStatusRow[]>([]);
  // Per-member data counts for the selected month (used to gate disabling).
  const [monthData, setMonthData] = useState<{
    [profileId: string]: { meals: number; deposits: number; costs: number };
  }>({});
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [availabilityMsg, setAvailabilityMsg] = useState("");

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
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  // Load the disabled-rows for the mess plus each member's own data (meals /
  // deposits / costs paid) for the selected month. The per-member data is what
  // gates disabling: a member with any data that month cannot be disabled.
  const loadAvailability = async (messId: string, membersList: any[]) => {
    setAvailabilityLoading(true);
    try {
      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;
      const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
      const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      const [statusRows, mealsRes, depositsRes, costsRes] = await Promise.all([
        fetchMonthlyStatus(messId),
        supabase.from("meals").select("*").gte("date", startDate).lte("date", endDate),
        supabase.from("deposits").select("*").gte("date", startDate).lte("date", endDate),
        supabase.from("costs").select("*").gte("date", startDate).lte("date", endDate),
      ]);

      setMonthlyStatus(statusRows);

      const meals = mealsRes.data || [];
      const deposits = depositsRes.data || [];
      const costs = costsRes.data || [];

      const data: { [id: string]: { meals: number; deposits: number; costs: number } } = {};
      membersList.forEach((m: any) => {
        const mealCount = meals
          .filter((x: any) => x.profile_id === m.id)
          .reduce((sum: number, x: any) => sum + Number(x.count || 0), 0);
        const depositCount = deposits.filter((x: any) => x.profile_id === m.id).length;
        // Only costs this member personally paid (their own data), not shared splits.
        const costCount = costs.filter((x: any) => x.profile_id === m.id).length;
        data[m.id] = { meals: mealCount, deposits: depositCount, costs: costCount };
      });
      setMonthData(data);
    } catch (err: any) {
      console.error(err);
      setAvailabilityMsg("Error loading month data: " + err.message);
    } finally {
      setAvailabilityLoading(false);
    }
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

      const { data: membersData } = await supabase
        .from("profiles")
        .select("*")
        .eq("mess_id", profileData.mess_id);
      setMembers(membersData || []);

      setLoading(false);
    };

    init();
  }, []);

  // Reload availability whenever the members list or selected month/year changes.
  useEffect(() => {
    if (profile?.mess_id && members.length > 0) {
      loadAvailability(profile.mess_id, members);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, members, selectedMonth, selectedYear]);

  // Enable/disable a member for the selected month.
  // Disable = insert a member_month_status row; enable = delete it.
  // Disabling is blocked if the member already has data that month.
  const handleToggleAvailability = async (
    member: any,
    currentlyDisabled: boolean
  ) => {
    if (!profile || profile.role !== "super_admin") {
      setAvailabilityMsg("Error: Only Super Admins can manage monthly availability.");
      return;
    }

    setAvailabilityMsg("");

    // Only gate the DISABLE direction. Enabling is always allowed.
    if (!currentlyDisabled) {
      const d = monthData[member.id] || { meals: 0, deposits: 0, costs: 0 };
      if (d.meals > 0 || d.deposits > 0 || d.costs > 0) {
        const parts: string[] = [];
        if (d.meals > 0) parts.push(`${d.meals} meal${d.meals === 1 ? "" : "s"}`);
        if (d.deposits > 0) parts.push(`${d.deposits} deposit${d.deposits === 1 ? "" : "s"}`);
        if (d.costs > 0) parts.push(`${d.costs} cost${d.costs === 1 ? "" : "s"} paid`);
        setAvailabilityMsg(
          `Error: ${member.full_name || "This member"} has ${parts.join(", ")} this month — remove that data first to disable them.`
        );
        return;
      }
    }

    setTogglingId(member.id);
    try {
      const existing = monthlyStatus.find(
        (r) =>
          r.profile_id === member.id &&
          r.year === selectedYear &&
          r.month === selectedMonth
      );

      if (currentlyDisabled) {
        // Re-enable: delete the disabled row (if present).
        if (existing) {
          const { error } = await supabase
            .from("member_month_status")
            .delete()
            .eq("id", existing.id);
          if (error) throw error;
        }
      } else {
        // Disable: insert a new row.
        const { data: { session } } = await supabase.auth.getSession();
        const { error } = await supabase.from("member_month_status").insert({
          mess_id: profile.mess_id,
          profile_id: member.id,
          year: selectedYear,
          month: selectedMonth,
          added_by: session?.user?.id,
        });
        if (error) throw error;
      }

      await loadAvailability(profile.mess_id, members);
    } catch (err: any) {
      console.error(err);
      setAvailabilityMsg("Error: " + err.message);
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center bg-zinc-950 text-zinc-50 py-24 gap-4">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-300 text-sm font-medium">Loading availability...</p>
      </div>
    );
  }

  const isSuperAdmin = profile?.role === "super_admin";
  const disabledSet = disabledIdsFor(monthlyStatus, selectedYear, selectedMonth);

  return (
    <div className="flex-1 bg-zinc-950 text-zinc-50 font-sans text-sm md:text-base flex flex-col h-full overflow-hidden">
      {/* Sticky Upper Action Bar */}
      <div className="sticky top-0 z-20 bg-zinc-950/80 backdrop-blur-md px-4 sm:px-6 md:px-8 py-4 sm:py-6 border-b border-zinc-900 shrink-0">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-white">Monthly Availability</h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            Disable members who are away for a month. Disabled members are excluded from that month&apos;s
            utility split and all calculations everywhere.
          </p>
        </div>
      </div>

      {/* Scrollable Page Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8">
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden backdrop-blur max-w-3xl">
          <div className="px-4 sm:px-6 py-4 border-b border-zinc-800 bg-zinc-900/55 flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center">
            <div>
              <h2 className="font-semibold text-sm md:text-base text-zinc-200 font-sans">Members</h2>
              <p className="text-xs text-zinc-500 font-sans">
                {isSuperAdmin
                  ? "Toggle who participates in the selected month"
                  : "Only Super Admins can change availability"}
              </p>
            </div>

            {/* Month / Year selector */}
            <div className="flex gap-2 shrink-0">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="bg-zinc-950/80 border border-zinc-800 px-3 py-2 rounded-lg text-zinc-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm appearance-none cursor-pointer font-sans"
              >
                {months.map((m) => (
                  <option key={m.value} value={m.value}>{m.name}</option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-zinc-950/80 border border-zinc-800 px-3 py-2 rounded-lg text-zinc-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm appearance-none cursor-pointer font-sans"
              >
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {availabilityMsg && (
            <p className={`px-4 sm:px-6 py-2 text-xs font-sans border-b border-zinc-800/60 ${
              availabilityMsg.startsWith("Error") ? "text-red-400" : "text-emerald-400"
            }`}>
              {availabilityMsg}
            </p>
          )}

          <div className="divide-y divide-zinc-800/40">
            {members.length === 0 ? (
              <p className="text-center py-8 text-zinc-500 text-sm">No members yet.</p>
            ) : (
              members.map((m) => {
                const disabled = disabledSet.has(m.id);
                const d = monthData[m.id] || { meals: 0, deposits: 0, costs: 0 };
                const hasData = d.meals > 0 || d.deposits > 0 || d.costs > 0;
                const dataBits: string[] = [];
                if (d.meals > 0) dataBits.push(`${d.meals} meal${d.meals === 1 ? "" : "s"}`);
                if (d.deposits > 0) dataBits.push(`${d.deposits} deposit${d.deposits === 1 ? "" : "s"}`);
                if (d.costs > 0) dataBits.push(`${d.costs} cost${d.costs === 1 ? "" : "s"} paid`);
                // Can only disable an active member who has no data this month.
                const blockDisable = !disabled && hasData;
                const isBusy = togglingId === m.id;

                return (
                  <div key={m.id} className="px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-white truncate">
                        {m.full_name || "Unnamed"}
                        {m.role === "super_admin" && (
                          <span className="ml-2 text-[10px] font-semibold text-indigo-400 uppercase">Admin</span>
                        )}
                      </p>
                      <p className="text-xs text-zinc-500 truncate">
                        {disabled
                          ? "Disabled for this month — excluded from all calculations"
                          : hasData
                            ? `Has data this month: ${dataBits.join(", ")}`
                            : "Active — no data logged yet this month"}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        disabled
                          ? "bg-zinc-800 text-zinc-400 border border-zinc-700"
                          : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      }`}>
                        {disabled ? "Disabled" : "Active"}
                      </span>

                      {isSuperAdmin && (
                        <button
                          onClick={() => handleToggleAvailability(m, disabled)}
                          disabled={isBusy || availabilityLoading || blockDisable}
                          title={blockDisable ? "Remove this member's data for the month before disabling" : ""}
                          className={`text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-sans ${
                            disabled
                              ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                              : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700"
                          }`}
                        >
                          {isBusy ? "..." : disabled ? "Enable" : "Disable"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
