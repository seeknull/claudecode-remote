import { Router, Request, Response } from "express";
import { getGitInfo, getGitDiff } from "../git-utils.js";

export function createGitRouter(): Router {
  const router = Router();

  router.get("/status", (req: Request, res: Response) => {
    const directory = req.query.directory as string;
    if (!directory) {
      res.status(400).json({ error: "directory query param required" });
      return;
    }
    const info = getGitInfo(directory);
    res.json(info);
  });

  router.get("/diff", (req: Request, res: Response) => {
    const directory = req.query.directory as string;
    const file = req.query.file as string | undefined;
    if (!directory) {
      res.status(400).json({ error: "directory query param required" });
      return;
    }
    const diff = getGitDiff(directory, file);
    res.json({ diff });
  });

  return router;
}
