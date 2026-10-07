import { getUserFromRequest } from "@/lib/auth";
import { businessesOf } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ user: null }, { status: 401 });
  const businesses = await businessesOf(user.id);
  return Response.json({
    user,
    businesses: businesses.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      industry: b.industry,
      plan: b.plan,
      secondsBalance: b.secondsBalance,
    })),
  });
}
