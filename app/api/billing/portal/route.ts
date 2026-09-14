import { NextResponse } from "next/server";

/**
 * Yoco does not provide a Stripe-style customer billing portal.
 * Manage recurring billing in the Yoco merchant dashboard instead.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Self-serve billing portal is not available with Yoco. Use the Yoco merchant dashboard or contact your WorkOps administrator.",
    },
    { status: 501 }
  );
}
