import { renderToString } from "react-dom/server";
import { Site, pages } from "./site";
export function renderPages() {
  return Object.entries(pages)
    .map(([pathname, page]) => ({
      pathname,
      title: page.title,
      html: renderToString(<Site pathname={pathname} />),
    }))
    .concat([
      {
        pathname: "/404",
        title: "Page not found - Privora",
        html: renderToString(<Site pathname="/404" />),
      },
    ]);
}
