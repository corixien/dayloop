import { useState } from "react";
import { syncClient, useT } from "../lib/app";
import { AuthError } from "../lib/sync";
import { Button, Field, Segmented, inputCls } from "./ui";

/** Sign in / sign up form, used on first run and in settings. */
export function AuthPanel({ onDone }: { onDone?: () => void }) {
  const t = useT();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr("");
    setBusy(true);
    try {
      await (mode === "in" ? syncClient.login(email, password) : syncClient.register(email, password));
      onDone?.();
    } catch (e) {
      const code = e instanceof AuthError ? e.code : "network";
      setErr(
        code === "wrong_credentials" ? t("authWrong") : code === "email_taken" ? t("authTaken")
        : code === "registration_closed" ? t("authClosed") : code === "invalid_credentials" ? t("authInvalid") : t("authNetwork"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-3">
      <Segmented value={mode} onChange={setMode} options={[{ value: "in", label: t("signIn") }, { value: "up", label: t("signUp") }]} />
      <Field label={t("email")}><input type="email" autoComplete="email" required className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label={t("password")}><input type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} required minLength={8} className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      {err && <p role="alert" className="text-[13px] text-danger">{err}</p>}
      <Button type="submit" variant="primary" disabled={busy} className="w-full">{mode === "in" ? t("signIn") : t("signUp")}</Button>
    </form>
  );
}
