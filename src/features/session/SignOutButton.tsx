import { useErrorMessage, useT } from "../../shared/i18n";
import { Button } from "../../shared/ui";
import { useSignOut } from "./session";

export function SignOutButton({ className }: { className?: string | undefined }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const signOut = useSignOut();
  return (
    <>
      <Button className={className} busy={signOut.isPending} onClick={() => signOut.mutate()}>
        {t("session.signOut")}
      </Button>
      {signOut.isError && <span role="alert">{errorMessage(signOut.error)}</span>}
    </>
  );
}
