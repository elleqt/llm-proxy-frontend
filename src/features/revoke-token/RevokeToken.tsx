import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type RefObject } from "react";
import { forgetFreshToken, tokensQuery, type Token } from "../../entities/token/tokens";
import { client, unwrap } from "../../shared/api/client";
import { useErrorMessage, useT } from "../../shared/i18n";
import { fill } from "../../shared/lib/template";
import { Button, Modal } from "../../shared/ui";

interface RevokeTokenProps {
  token: Pick<Token, "id" | "label">;
  /** Where focus goes once the key is revoked and this row's button is gone. */
  returnFocus: RefObject<HTMLElement | null>;
}

/** A row's "Revoke" button and the confirmation naming the key. */
export function RevokeToken({ token, returnFocus }: RevokeTokenProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button aria-label={fill(t("revoke.openLabel"), { label: token.label })} onClick={() => setOpen(true)}>
        {t("revoke.open")}
      </Button>
      {open && <RevokeTokenDialog token={token} returnFocus={returnFocus} onClose={() => setOpen(false)} />}
    </>
  );
}

function RevokeTokenDialog({ token, returnFocus, onClose }: RevokeTokenProps & { onClose: () => void }) {
  const t = useT();
  // A destructive confirmation opens on the safe choice.
  const cancelRef = useRef<HTMLButtonElement>(null);
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const revoke = useMutation({
    mutationFn: () => unwrap(client.DELETE("/api/me/tokens/{tokenId}", { params: { path: { tokenId: token.id } } })),
    onSuccess: async () => {
      forgetFreshToken(queryClient, token.id);
      await queryClient.invalidateQueries({ queryKey: tokensQuery.queryKey });
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      initialFocus={cancelRef}
      returnFocus={returnFocus}
      title={fill(t("revoke.title"), { label: token.label })}
      footer={
        <>
          <Button ref={cancelRef} onClick={onClose}>
            {t("ui.cancel")}
          </Button>
          <Button variant="danger" busy={revoke.isPending} onClick={() => revoke.mutate()}>
            {t("revoke.confirm")}
          </Button>
        </>
      }
    >
      <p>{fill(t("revoke.body"), { label: token.label })}</p>
      {revoke.isError && <p role="alert">{errorMessage(revoke.error)}</p>}
    </Modal>
  );
}
