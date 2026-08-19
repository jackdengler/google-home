import { render } from "preact";
import { App } from "./app.js";
import { ThermostatApi } from "./api.js";
import "./styles.css";

const api = new ThermostatApi(import.meta.env.VITE_API_BASE_URL || "https://example.invalid");
render(<App api={api} initiallyUnlocked={api.isUnlocked()} />, document.getElementById("app")!);
