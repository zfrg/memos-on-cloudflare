import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { authRequired } from "./middleware/auth";
import { authRoutes } from "./routes/auth";
import { memoRoutes } from "./routes/memos";
import { userRoutes } from "./routes/users";
import { attachmentRoutes } from "./routes/attachments";
import { fileRoutes } from "./routes/files";
import { instanceRoutes } from "./routes/instance";
import { healthRoutes } from "./routes/health";
import { shortcutRoutes } from "./routes/shortcuts";
import { idpRoutes } from "./routes/idp";
import { aiRoutes } from "./routes/ai";
import { sseRoutes } from "./routes/sse";
import { rssRoutes } from "./routes/rss";
import { findUserById } from "./db/user";
import { formatUser } from "./routes/users";

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", cors());

app.route("/api/v1/auth", authRoutes);
app.get("/api/v1/user/me", authRequired, async (c) => {
  const currentUser = c.get("user");
  const user = await findUserById(c.env.DB, currentUser.id);
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const formattedUser = formatUser(user);
  return c.json({
    user: formattedUser,
    ...formattedUser,
  });
});
app.route("/api/v1/memos", memoRoutes);
app.route("/api/v1/users", userRoutes);
app.route("/api/v1/attachments", attachmentRoutes);
app.route("/api/v1/instance", instanceRoutes);
app.route("/api/v1/health", healthRoutes);
app.route("/api/v1/shortcuts", shortcutRoutes);
app.route("/api/v1/idps", idpRoutes);
app.route("/api/v1/ai", aiRoutes);
app.route("/api/v1/sse", sseRoutes);
app.route("/file", fileRoutes);
app.route("/u", rssRoutes);

app.notFound((c) => {
  return c.json({ code: 5, message: "Not Found", details: [] }, 404);
});

app.onError((err, c) => {
  if (err.message?.includes("Method Not Allowed")) {
    return c.json({ code: 12, message: "Method Not Allowed", details: [] }, 405);
  }
  console.error(err);
  return c.json({ code: 2, message: err.message || "Internal Server Error", details: [] }, 500);
});

export default app;
