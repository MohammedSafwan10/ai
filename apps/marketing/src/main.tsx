import { hydrateRoot, createRoot } from "react-dom/client";
import { Site } from "./site";
import "./styles/globals.css";
const element = document.getElementById("root")!;
const page = <Site pathname={window.location.pathname} />;
if (element.hasChildNodes()) hydrateRoot(element, page);
else createRoot(element).render(page);
