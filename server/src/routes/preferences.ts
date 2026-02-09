import { Router, Request, Response } from "express";
import { preferencesManager } from "../preferences-manager.js";

export function createPreferencesRouter(): Router {
  const router = Router();

  router.get("/", (_req: Request, res: Response) => {
    res.json(preferencesManager.get());
  });

  router.put("/star-session/:id", (req: Request, res: Response) => {
    const starred = preferencesManager.toggleStarSession(req.params.id);
    res.json({ starred });
  });

  router.put("/hide-session/:id", (req: Request, res: Response) => {
    const hidden = preferencesManager.toggleHideSession(req.params.id);
    res.json({ hidden });
  });

  router.put("/star-project", (req: Request, res: Response) => {
    const { path } = req.body;
    if (!path) {
      res.status(400).json({ error: "path is required" });
      return;
    }
    const starred = preferencesManager.toggleStarProject(path);
    res.json({ starred });
  });

  router.put("/hide-project", (req: Request, res: Response) => {
    const { path } = req.body;
    if (!path) {
      res.status(400).json({ error: "path is required" });
      return;
    }
    const hidden = preferencesManager.toggleHideProject(path);
    res.json({ hidden });
  });

  router.put("/last-seen/:sessionId", (req: Request, res: Response) => {
    const { count } = req.body;
    if (typeof count !== "number") {
      res.status(400).json({ error: "count (number) is required" });
      return;
    }
    preferencesManager.setLastSeen(req.params.sessionId, count);
    res.json({ ok: true });
  });

  return router;
}
