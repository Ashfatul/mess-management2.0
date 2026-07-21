import { supabase } from "@/lib/supabase";

// A row in `member_month_status` means the member is DISABLED (not participating)
// for that (year, month). No row = active. See schema.sql.
export interface MemberMonthStatusRow {
  id: string;
  mess_id: string;
  profile_id: string;
  year: number;
  month: number;
}

// Fetch every "disabled" row for a mess. Small table (only disabled entries),
// so we pull all of them once and filter per-month in memory.
export const fetchMonthlyStatus = async (
  messId: string
): Promise<MemberMonthStatusRow[]> => {
  const { data } = await supabase
    .from("member_month_status")
    .select("*")
    .eq("mess_id", messId);
  return (data as MemberMonthStatusRow[]) || [];
};

// Set of profile IDs disabled for a specific (year, month).
export const disabledIdsFor = (
  rows: MemberMonthStatusRow[],
  year: number,
  month: number
): Set<string> => {
  const set = new Set<string>();
  rows.forEach((r) => {
    if (r.year === year && r.month === month) set.add(r.profile_id);
  });
  return set;
};

// Filter a members list down to those active for the given month.
export const activeMembersFor = <T extends { id: string }>(
  members: T[],
  rows: MemberMonthStatusRow[],
  year: number,
  month: number
): T[] => {
  const disabled = disabledIdsFor(rows, year, month);
  return members.filter((m) => !disabled.has(m.id));
};
