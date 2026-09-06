import { createRoot } from "react-dom/client";
import "./style.css";
const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
createRoot(root).render(
  <main>
    <p>mtn.lu</p>
    <h1>A little place for us.</h1>
    <p>Small apps. Shared plans. Good company.</p>
  </main>,
);
