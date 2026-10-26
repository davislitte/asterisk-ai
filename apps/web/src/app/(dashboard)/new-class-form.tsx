"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type FormState, createClass } from "./actions";

export function NewClassForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(createClass, {});

  return (
    <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="class-name">New class</Label>
        <Input id="class-name" name="name" placeholder="e.g. Algebra I — Period 3" required maxLength={80} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create class"}
      </Button>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
