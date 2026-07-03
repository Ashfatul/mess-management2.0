"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [messName, setMessName] = useState("");
  const [isInvited, setIsInvited] = useState(false);
  const [inviteData, setInviteData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [checkingToken, setCheckingToken] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Check if signup is from an invite token
  useEffect(() => {
    if (token) {
      setCheckingToken(true);
      supabase
        .from("invites")
        .select("*")
        .eq("token", token)
        .eq("status", "pending")
        .single()
        .then((res: any) => {
          const data = res.data;
          const error = res.error;
          if (data && !error) {
            const created = new Date(data.created_at);
            const ageInDays = (new Date().getTime() - created.getTime()) / (1000 * 3600 * 24);
            if (ageInDays > 30) {
              setErrorMsg("This invitation has expired (valid for 30 days). Registering as regular user.");
            } else {
              setEmail(data.email);
              setIsInvited(true);
              setInviteData(data);
            }
          } else {
            setErrorMsg("Invalid invite token. Registering as regular user.");
          }
          setCheckingToken(false);
        });
    }
  }, [token]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      if (!isInvited && !messName.trim()) {
        throw new Error("Please specify a Mess Name.");
      }

      // 1. Sign up the user (triggers DB server-side trigger creation for mess and profile)
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            mess_name: !isInvited ? messName.trim() : undefined,
          },
        },
      });

      if (signUpError) throw signUpError;

      const userId = signUpData.user?.id;
      if (!userId) throw new Error("Signup failed. User not created.");

      setSuccessMsg("Account created successfully! Redirecting...");
      setTimeout(() => {
        router.push("/dashboard");
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.message || "An error occurred during sign up.");
      setLoading(false);
    }
  };

  return (
    <div className="bg-zinc-900/60 border border-zinc-800/80 p-8 rounded-2xl backdrop-blur-xl shadow-xl">
      {checkingToken ? (
        <div className="flex flex-col items-center py-6">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-zinc-400 text-sm">Validating invitation token...</p>
        </div>
      ) : (
        <>
          {errorMsg && (
            <div className="mb-4 p-3 rounded-lg bg-red-950/50 border border-red-800 text-red-200 text-xs">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-950/50 border border-emerald-800 text-emerald-200 text-xs">
              {successMsg}
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSignup}>
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-zinc-300">
                Full Name
              </label>
              <input
                id="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1.5 block w-full rounded-lg bg-zinc-950/80 border border-zinc-800 px-3.5 py-2 text-zinc-200 shadow-sm placeholder:text-zinc-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                placeholder="Full Name"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-zinc-300">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                disabled={isInvited}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 block w-full rounded-lg bg-zinc-950/80 border border-zinc-800 px-3.5 py-2 text-zinc-200 shadow-sm placeholder:text-zinc-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm disabled:opacity-50"
                placeholder="name@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-zinc-300">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 block w-full rounded-lg bg-zinc-950/80 border border-zinc-800 px-3.5 py-2 text-zinc-200 shadow-sm placeholder:text-zinc-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                placeholder="•••••••• (Min 6 chars)"
              />
            </div>

            {!isInvited && (
              <div>
                <label htmlFor="messName" className="block text-sm font-medium text-zinc-300">
                  Give Your Mess a Name
                </label>
                <input
                  id="messName"
                  type="text"
                  required
                  value={messName}
                  onChange={(e) => setMessName(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg bg-zinc-950/80 border border-zinc-800 px-3.5 py-2 text-zinc-200 shadow-sm placeholder:text-zinc-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                  placeholder="e.g. Dream Mess, Valley View"
                />
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="flex w-full justify-center rounded-lg bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 transition-colors"
              >
                {loading ? "Creating account..." : isInvited ? "Accept Invite & Join" : "Create Mess Account"}
              </button>
            </div>
          </form>

          <p className="mt-6 text-center text-xs text-zinc-400">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-indigo-400 hover:text-indigo-300">
              Sign In
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

export default function SignupPage() {
  return (
    <div className="flex-1 flex flex-col justify-center bg-zinc-950 text-zinc-50 relative px-6 py-12 lg:px-8 font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-950/30 via-zinc-950 to-zinc-950 pointer-events-none" />
      
      <div className="sm:mx-auto sm:w-full sm:max-w-sm z-10">
        <Link href="/" className="flex justify-center items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <span className="font-bold text-xl text-white">M</span>
          </div>
          <span className="font-semibold text-lg text-zinc-200">Mess Management</span>
        </Link>
        <h2 className="text-center text-2xl font-bold tracking-tight text-white mb-2">
          Create your account
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-sm z-10">
        <Suspense fallback={<div className="text-center py-6 text-zinc-400 text-sm">Loading signup module...</div>}>
          <SignupForm />
        </Suspense>
      </div>
    </div>
  );
}
