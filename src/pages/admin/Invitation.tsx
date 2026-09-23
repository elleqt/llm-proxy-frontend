import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminUserQuery, adminUsersQuery, type AdminUser } from "../../entities/user/adminUsers";
import { client, unwrap } from "../../shared/api/client";
import { useErrorMessage, useLang, useT } from "../../shared/i18n";
import { shortDateTime } from "../../shared/lib/dates";
import { fill } from "../../shared/lib/template";
import { Badge, Button } from "../../shared/ui";
import styles from "./admin.module.css";

/** A pending identity-provider invitation, or one that lapsed before anyone claimed the account. */
export function InvitationState({ expiresAt }: { expiresAt: string }) {
  const t = useT();
  const [lang] = useLang();
  if (Date.parse(expiresAt) <= Date.now()) return <Badge tone="muted">{t("admin.invitationLapsed")}</Badge>;
  const until = shortDateTime(Date.parse(expiresAt), Date.now(), lang);
  return <Badge tone="neutral">{fill(t("admin.invitationPending"), { time: until })}</Badge>;
}

/** The invitation line of a person's card: "Invite…" with none pending, "Renew invitation" with one. */
export function Invitation({ user }: { user: AdminUser }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const renew = useMutation({
    mutationFn: () =>
      unwrap(client.POST("/api/admin/users/{userId}/invitation", { params: { path: { userId: user.id } } })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminUserQuery(user.id).queryKey });
      void queryClient.invalidateQueries({ queryKey: adminUsersQuery.queryKey, exact: true });
    },
  });
  return (
    <div className={`${styles.inlineForm} ${styles.invitation}`}>
      <p className={styles.dim}>
        {user.invitationExpiresAt == null ? (
          t("admin.invitationNone")
        ) : (
          <InvitationState expiresAt={user.invitationExpiresAt} />
        )}
      </p>
      <Button busy={renew.isPending} onClick={() => renew.mutate()}>
        {t(user.invitationExpiresAt == null ? "admin.invite" : "admin.renewInvitation")}
      </Button>
      {renew.isError && <p role="alert">{errorMessage(renew.error)}</p>}
      <p role="status" className={styles.dim}>
        {renew.isSuccess ? fill(t("admin.invitationRenewed"), { email: user.email ?? "" }) : ""}
      </p>
    </div>
  );
}
