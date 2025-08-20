import Router from "express";
import {
  createSubject,
  getSubjectsByClass,
  getSubjectById,
  getSubjects,
} from "../controllers/subject.controller.js";
import verifyJWT from "../middlewares/auth.middleware.js";

const router = new Router();

router.post("/create", verifyJWT, createSubject);
router.get("/get", verifyJWT, getSubjects);
router.get("/get-subjects", verifyJWT, getSubjectsByClass);
router.get("/get/:subjectId", getSubjectById);

export default router;