import { Router, Request, Response } from "express";
import { discoverDirectories } from "../claude-session-scanner.js";

export function createDirectoriesRouter(): Router {
  const router = Router();

  router.get("/", (_req: Request, res: Response) => {
    const discovered = discoverDirectories();

    const result = discovered.map((dir) => ({
      path: dir.path,
      label: dir.label,
      sessionCount: dir.sessionCount,
    }));

    result.sort((a, b) => a.path.localeCompare(b.path));

    res.json(result);
  });

  return router;
}
