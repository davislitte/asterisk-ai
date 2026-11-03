import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTeacher } from "@/server/auth";
import { viewAsGuest } from "./actions";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Asterisk" };

export default async function LoginPage() {
  if (await getTeacher()) redirect("/");

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Asterisk</CardTitle>
          <CardDescription>AI in your classroom, on your terms.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <LoginForm />
          <form action={viewAsGuest} className="flex flex-col gap-1.5 border-t pt-4">
            <Button type="submit" variant="outline">
              View as guest
            </Button>
            <p className="text-center text-xs text-muted-foreground">Explore a sample class. Read-only, no passcode.</p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
