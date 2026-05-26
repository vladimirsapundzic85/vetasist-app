import { createClient } from "@supabase/supabase-js";

export type AdminAuthResult =
  | {
      ok: true;
      user: {
        id: string;
        email: string | null;
      };
      admin: {
        user_id: string;
        email: string;
        role: string;
      };
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export function getBearerToken(req: Request): string {
  const authHeader = req.headers.get("authorization") || "";

  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return authHeader.slice("bearer ".length).trim();
}

export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function requireAdmin(req: Request): Promise<AdminAuthResult> {
  const token = getBearerToken(req);

  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "missing_auth_token",
    };
  }

  const supabase = createSupabaseAdminClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser(token);

  if (userErr || !user) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
    };
  }

  const { data: admin, error: adminErr } = await supabase
    .from("admin_users")
    .select("user_id,email,role,is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (adminErr) {
    return {
      ok: false,
      status: 500,
      error: "admin_lookup_failed",
    };
  }

  if (!admin) {
    return {
      ok: false,
      status: 403,
      error: "not_admin",
    };
  }

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email ?? null,
    },
    admin: {
      user_id: String(admin.user_id),
      email: String(admin.email),
      role: String(admin.role),
    },
  };
}
