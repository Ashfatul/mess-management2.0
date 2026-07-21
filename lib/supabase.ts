import { createClient } from '@supabase/supabase-js';

const realUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const realKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const isPlaceholder = !realUrl || !realKey || realUrl === 'https://placeholder.supabase.co' || realKey === 'placeholder-key';

// Define standard types for our mock DB
interface MockDB {
  messes: any[];
  profiles: any[];
  invites: any[];
  meals: any[];
  deposits: any[];
  costs: any[];
  settlements: any[];
  member_month_status: any[];
  currentUser: any | null;
}

// Initial seed mock data representing the Excel sheets
const INITIAL_MOCK_DATA: MockDB = {
  messes: [
    { id: "mock-mess-id", name: "Dream Mess May 2026", created_at: new Date().toISOString() }
  ],
  profiles: [
    { id: "user-shariful", email: "shariful@example.com", full_name: "Shariful", role: "member", mess_id: "mock-mess-id" },
    { id: "user-ashfatul", email: "ashfatul@example.com", full_name: "Ashfatul", role: "super_admin", mess_id: "mock-mess-id" },
    { id: "user-mostakim", email: "mostakim@example.com", full_name: "Mostakim", role: "member", mess_id: "mock-mess-id" },
    { id: "user-fahim", email: "fahim@example.com", full_name: "Fahim", role: "member", mess_id: "mock-mess-id" },
    { id: "user-sadman", email: "sadman@example.com", full_name: "Sadman", role: "member", mess_id: "mock-mess-id" },
    { id: "user-hamim", email: "hamim@example.com", full_name: "Hamim", role: "member", mess_id: "mock-mess-id" },
  ],
  invites: [
    { id: "invite-1", email: "newcomer@example.com", role: "member", mess_id: "mock-mess-id", token: "mock-token-xyz", status: "pending" }
  ],
  meals: [
    // Pre-populate some meals matching row values in Excel
    { id: "m1", profile_id: "user-shariful", date: "2026-05-02", count: 1.0 },
    { id: "m2", profile_id: "user-shariful", date: "2026-05-03", count: 1.0 },
    { id: "m3", profile_id: "user-shariful", date: "2026-05-04", count: 1.0 },
    { id: "m4", profile_id: "user-shariful", date: "2026-05-05", count: 1.0 },
    { id: "m5", profile_id: "user-shariful", date: "2026-05-06", count: 1.0 },
    { id: "m6", profile_id: "user-shariful", date: "2026-05-08", count: 2.0 },
    { id: "m7", profile_id: "user-shariful", date: "2026-05-09", count: 2.0 },
    { id: "m8", profile_id: "user-ashfatul", date: "2026-05-06", count: 1.0 },
    { id: "m9", profile_id: "user-ashfatul", date: "2026-05-07", count: 2.0 },
    { id: "m10", profile_id: "user-ashfatul", date: "2026-05-08", count: 2.0 },
    { id: "m11", profile_id: "user-ashfatul", date: "2026-05-09", count: 2.0 },
  ],
  deposits: [
    { id: "d1", profile_id: "user-ashfatul", date: "2026-05-01", amount: 1000.0, added_by: "user-ashfatul" },
    { id: "d2", profile_id: "user-shariful", date: "2026-05-08", amount: 1000.0, added_by: "user-ashfatul" },
  ],
  costs: [
    { id: "c1", profile_id: "user-hamim", date: "2026-05-01", cost_category: "meal_bazar", items: "fish, chicken, tomato", amount: 990.0 },
    { id: "c2", profile_id: "user-sadman", date: "2026-05-04", cost_category: "meal_bazar", items: "dal", amount: 160.0 },
    { id: "c3", profile_id: "user-hamim", date: "2026-05-05", cost_category: "meal_bazar", items: "chicken, fish, oil", amount: 870.0 },
    { id: "c4", profile_id: "user-shariful", date: "2026-05-06", cost_category: "meal_bazar", items: "Dal + Dim", amount: 170.0 },
    { id: "c5", profile_id: "user-shariful", date: "2026-05-05", cost_category: "electricity", items: "Electricity Bill", amount: 400.0 },
    { id: "c6", profile_id: "user-ashfatul", date: "2026-05-07", cost_category: "wifi", items: "Wifi Bill", amount: 680.0 },
  ],
  settlements: [],
  member_month_status: [],
  currentUser: {
    id: "user-ashfatul",
    email: "ashfatul@example.com",
    user_metadata: { full_name: "Ashfatul" }
  }
};

const getLocalDB = (): MockDB => {
  if (typeof window === "undefined") return INITIAL_MOCK_DATA;
  const data = localStorage.getItem("mess_mock_db");
  if (!data) {
    localStorage.setItem("mess_mock_db", JSON.stringify(INITIAL_MOCK_DATA));
    return INITIAL_MOCK_DATA;
  }
  const parsed = JSON.parse(data);
  // Backfill any tables missing from an older persisted DB so inserts don't get lost
  (Object.keys(INITIAL_MOCK_DATA) as (keyof MockDB)[]).forEach((key) => {
    if (key !== "currentUser" && !(key in parsed)) {
      (parsed as any)[key] = [];
    }
  });
  return parsed;
};

const saveLocalDB = (db: MockDB) => {
  if (typeof window !== "undefined") {
    localStorage.setItem("mess_mock_db", JSON.stringify(db));
  }
};

// Create a mock Supabase Client
const mockSupabase: any = {
  auth: {
    getSession: async () => {
      const db = getLocalDB();
      if (db.currentUser) {
        return { data: { session: { user: db.currentUser } }, error: null };
      }
      return { data: { session: null }, error: null };
    },
    onAuthStateChange: (callback: any) => {
      const db = getLocalDB();
      const session = db.currentUser ? { user: db.currentUser } : null;
      callback("SIGNED_IN", session);
      return {
        data: {
          unsubscribe: () => {}
        }
      };
    },
    signInWithPassword: async ({ email }: { email: string }) => {
      const db = getLocalDB();
      const profile = db.profiles.find((p) => p.email === email);
      if (profile) {
        db.currentUser = { id: profile.id, email: profile.email, user_metadata: { full_name: profile.full_name } };
        saveLocalDB(db);
        return { data: { user: db.currentUser }, error: null };
      }
      return { data: null, error: { message: "Invalid email. Pre-seeded: ashfatul@example.com, shariful@example.com" } };
    },
    signUp: async ({ email, options }: any) => {
      const db = getLocalDB();
      const id = "user-" + Math.random().toString(36).substr(2, 9);
      const newProfile = {
        id,
        email,
        full_name: options?.data?.full_name || "",
        role: "member",
        mess_id: null as string | null
      };

      // Check invite link completion
      const pendingInvite = db.invites.find((i) => i.email === email && i.status === "pending");
      if (pendingInvite) {
        newProfile.mess_id = pendingInvite.mess_id;
        newProfile.role = pendingInvite.role;
        pendingInvite.status = "accepted";
      } else if (options?.data?.mess_name) {
        const newMessId = "mess-" + Math.random().toString(36).substr(2, 9);
        db.messes.push({
          id: newMessId,
          name: options.data.mess_name,
          created_at: new Date().toISOString()
        });
        newProfile.mess_id = newMessId;
        newProfile.role = "super_admin";
      } else if (db.profiles.length === 0) {
        newProfile.role = "super_admin";
      }

      db.profiles.push(newProfile);
      db.currentUser = { id, email, user_metadata: { full_name: newProfile.full_name } };
      saveLocalDB(db);
      return { data: { user: db.currentUser }, error: null };
    },
    signOut: async () => {
      const db = getLocalDB();
      db.currentUser = null;
      saveLocalDB(db);
      return { error: null };
    }
  },

  from: (table: string) => {
    return {
      select: (columns: string = "*") => {
        return {
          eq: (field: string, value: any) => {
            return {
              single: async () => {
                const db = getLocalDB();
                const list = (db as any)[table] || [];
                const item = list.find((x: any) => x[field] === value);
                return { data: item || null, error: item ? null : { message: "Not found" } };
              },
              eq: (field2: string, value2: any) => {
                return {
                  order: async (sortField: string, options?: any) => {
                    const db = getLocalDB();
                    let list = (db as any)[table] || [];
                    list = list.filter((x: any) => x[field] === value && x[field2] === value2);
                    return { data: list, error: null };
                  }
                };
              },
              gte: (dateField: string, startDate: string) => {
                return {
                  lte: async (dateField2: string, endDate: string) => {
                    const db = getLocalDB();
                    let list = (db as any)[table] || [];
                    list = list.filter((x: any) => {
                      const dateVal = x.date;
                      return x[field] === value && dateVal >= startDate && dateVal <= endDate;
                    });
                    
                    // Populate joining table profiles on demand for UI select queries
                    if (table === "costs" || table === "deposits") {
                      list = list.map((item: any) => {
                        const profile = db.profiles.find((p) => p.id === item.profile_id);
                        return {
                          ...item,
                          profiles: { full_name: profile ? profile.full_name : "Unknown" }
                        };
                      });
                    }
                    return { data: list, error: null };
                  }
                };
              },
              order: async (sortField: string, options?: any) => {
                const db = getLocalDB();
                let list = (db as any)[table] || [];
                list = list.filter((x: any) => x[field] === value);
                return { data: list, error: null };
              },
              then: async (onfulfilled: any) => {
                const db = getLocalDB();
                let list = (db as any)[table] || [];
                list = list.filter((x: any) => x[field] === value);
                return onfulfilled({ data: list, error: null });
              }
            };
          },
          gte: (dateField: string, startDate: string) => {
            return {
              lte: async (dateField2: string, endDate: string) => {
                const db = getLocalDB();
                let list = (db as any)[table] || [];
                list = list.filter((x: any) => {
                  const dateVal = x.date;
                  return dateVal >= startDate && dateVal <= endDate;
                });
                
                // Populate joining table profiles on demand for UI select queries
                if (table === "costs" || table === "deposits") {
                  list = list.map((item: any) => {
                    const profile = db.profiles.find((p) => p.id === item.profile_id);
                    return {
                      ...item,
                      profiles: { full_name: profile ? profile.full_name : "Unknown" }
                    };
                  });
                }
                
                // Sort descending by date
                list.sort((a: any, b: any) => b.date.localeCompare(a.date));
                return { data: list, error: null };
              }
            };
          },
          order: async (sortField: string, options?: any) => {
            const db = getLocalDB();
            const list = [...((db as any)[table] || [])];
            return { data: list, error: null };
          },
          then: async (onfulfilled: any) => {
            const db = getLocalDB();
            const list = (db as any)[table] || [];
            return onfulfilled({ data: list, error: null });
          }
        };
      },
      insert: (record: any) => {
        return {
          select: () => {
            return {
              single: async () => {
                const db = getLocalDB();
                const recordWithId = {
                  id: "id-" + Math.random().toString(36).substr(2, 9),
                  created_at: new Date().toISOString(),
                  ...record
                };
                ((db as any)[table] || []).push(recordWithId);
                saveLocalDB(db);
                return { data: recordWithId, error: null };
              }
            };
          },
          then: async (onfulfilled: any) => {
            const db = getLocalDB();
            const recordWithId = {
              id: "id-" + Math.random().toString(36).substr(2, 9),
              created_at: new Date().toISOString(),
              ...record
            };
            ((db as any)[table] || []).push(recordWithId);
            saveLocalDB(db);
            return onfulfilled({ data: recordWithId, error: null });
          }
        };
      },
      update: (fields: any) => {
        return {
          eq: async (field: string, value: any) => {
            const db = getLocalDB();
            const list = (db as any)[table] || [];
            list.forEach((item: any) => {
              if (item[field] === value) {
                Object.assign(item, fields);
              }
            });
            saveLocalDB(db);
            return { error: null };
          }
        };
      },
      upsert: (records: any | any[], options?: any) => {
        return {
          then: async (onfulfilled: any) => {
            const db = getLocalDB();
            const list = (db as any)[table] || [];
            const newRecords = Array.isArray(records) ? records : [records];
            
            newRecords.forEach((rec) => {
              // Check if we already have it (for meals: profile_id and date match)
              const existingIdx = list.findIndex((x: any) => x.profile_id === rec.profile_id && x.date === rec.date);
              if (existingIdx !== -1) {
                list[existingIdx] = { ...list[existingIdx], ...rec };
              } else {
                list.push({ id: "meal-" + Math.random().toString(36).substr(2, 9), ...rec });
              }
            });

            saveLocalDB(db);
            return onfulfilled({ data: list, error: null });
          }
        };
      },
      delete: () => {
        return {
          eq: async (field: string, value: any) => {
            const db = getLocalDB();
            let list = (db as any)[table] || [];
            list = list.filter((x: any) => x[field] !== value);
            (db as any)[table] = list;
            saveLocalDB(db);
            return { error: null };
          }
        };
      }
    };
  }
};

// Export actual Supabase client or local mockup transparently
export const supabase = isPlaceholder 
  ? mockSupabase 
  : createClient(realUrl, realKey);
