import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { connectInfoQuery } from "../../entities/connect/connectInfo";
import { takeFreshToken, type FreshToken } from "../../entities/token/tokens";
import { useErrorMessage, useT } from "../../shared/i18n";
import { fill } from "../../shared/lib/template";
import { Spinner } from "../../shared/ui";
import { snippets } from "./snippets";

export function ConnectPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const info = useQuery(connectInfoQuery);
  // The key handed over by the issue dialog lives in this page's state and
  // dies with it: leaving /connect and coming back shows the placeholder.
  const [fresh, setFresh] = useState<FreshToken | null>(null);
  useEffect(() => {
    // Taken in an effect, not a state initialiser: StrictMode calls those
    // twice, and the second call would find the holder already empty.
    const token = takeFreshToken();
    if (token !== null) setFresh(token);
  }, []);
  const placeholder = t("connect.keyPlaceholder");
  // The placeholder is set in code inside the sentence, so it is split rather than filled.
  const [before, after] = t("connect.noKey").split("{placeholder}");

  let body;
  if (info.isPending) {
    body = <Spinner label={t("app.loading")} />;
  } else if (info.isError) {
    body = <p role="alert">{errorMessage(info.error)}</p>;
  } else {
    const blocks = snippets(info.data.apiBaseURL, fresh?.secret ?? placeholder, t("connect.modelPlaceholder"));
    body = (
      <>
        <h2>Claude Code</h2>
        <p>{t("connect.claude")}</p>
        <pre>
          <code>{blocks.claudeCode}</code>
        </pre>

        <h2>omp</h2>
        <p>{t("connect.omp")}</p>
        <pre>
          <code>{blocks.omp}</code>
        </pre>

        <h2>curl</h2>
        <p>{t("connect.curlModels")}</p>
        <pre>
          <code>{blocks.curlModels}</code>
        </pre>
        <p>{t("connect.curlChat")}</p>
        <pre>
          <code>{blocks.curlChat}</code>
        </pre>
      </>
    );
  }

  return (
    <>
      <h1>{t("page.connect.title")}</h1>
      <p>{t("connect.intro")}</p>
      {fresh !== null ? (
        <p>{fill(t("connect.fresh"), { label: fresh.label })}</p>
      ) : (
        <p>
          {before}
          <code>{placeholder}</code>
          {after} <Link to="/">{t("issue.open")}</Link>
        </p>
      )}
      {body}

      <h2>{t("connect.trouble")}</h2>
      <dl>
        <dt>
          <code>401</code>
        </dt>
        <dd>{t("connect.trouble401")}</dd>
        <dt>
          <code>403</code>
        </dt>
        <dd>{t("connect.trouble403")}</dd>
      </dl>
    </>
  );
}
