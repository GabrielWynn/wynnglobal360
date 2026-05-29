import { NextResponse } from "next/server";
import { requireIFARecord, unauthorised } from "@/lib/auth-guard";
import {
  createClient,
  listClients,
} from "@/lib/financial-planner/fact-find-service";
import type { CreateClientPayload } from "@/lib/financial-planner/fact-find-types";

export async function GET(request: Request) {
  const rec = await requireIFARecord(request);
  if (!rec) return unauthorised();

  try {
    // Admins see all clients; IFAs see only their own
    const ifaId = rec.role === "admin"
      ? (new URL(request.url).searchParams.get("ifa_id") ?? rec.ifaId)
      : rec.ifaId;

    const clients = await listClients(ifaId);
    return NextResponse.json({ clients });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const rec = await requireIFARecord(request);
  if (!rec) return unauthorised();

  try {
    const body = await request.json() as Partial<CreateClientPayload>;
    if (!body.first_name?.trim() || !body.last_name?.trim()) {
      return NextResponse.json(
        { error: "first_name and last_name are required" },
        { status: 400 }
      );
    }

    const client = await createClient(rec.ifaId, {
      first_name: body.first_name,
      last_name: body.last_name,
      email: body.email,
      phone: body.phone,
      date_of_birth: body.date_of_birth,
      nationality: body.nationality,
      notes: body.notes,
    });
    return NextResponse.json({ client }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
