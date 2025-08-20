import Question from "../models/question.model.js";
import Response from "../models/response.model.js";
import Result from "../models/result.model.js";
import Class from "../models/class.model.js";
import mongoose from "mongoose";
const { ObjectId } = mongoose.Types;
import { uploadOnCloudinary } from "../utils/cloudinary.js";

export const submitResponse = async (req, res) => {
  const { answers, testId } = req.body;
  // console.log("answers : ", answers);

  // if (!answers) {
  //   console.log("Cannot get answers", answers);
  //   return res.status(400).json({ message: "Cannot get answers" });
  // }

  let marksObtained = 0;
  console.log("req.file", req.file);

  const responsePdf = req.file?.path;
  console.log("pdf", responsePdf);

  let newResponse;

  try {
    // Subjective

    if (responsePdf) {
      const pdfUrl = await uploadOnCloudinary(responsePdf);
      if (!pdfUrl) {
        console.log("Cannot get cloudinary file path");
        return res.status(400).json({
          message: "Cannot get cloudinary file path",
        });
      }

      newResponse = new Response({
        responsePdfUrl: pdfUrl,
        test: testId,
        student: req.user.id,
        classId: req.user.classId,
      });
    }
    // Objective
    else {
      for (let i = 0; i < answers.length; i++) {
        const currQues = answers[i].question;
        const currAns = answers[i].answer;
        // console.log(ques);

        try {
          const questionDetails = await Question.findById(currQues).select(
            "answer marks"
          );

          if (!questionDetails) {
            console.log("Cannot find question", currQues);
            return res.status(404).json({ message: "Cannot find question" });
          }

          // correct answer?
          // console.log("question", questionDetails.answer);
          // console.log("answer", currAns);

          if (questionDetails.answer == currAns) {
            marksObtained += questionDetails.marks;
          }
        } catch (error) {
          console.log("Error fetching questions", error);
          return res
            .status(500)
            .json({ message: "Error fetching questions", data: error });
        }
      }
      // console.log(marksObtained);

      newResponse = new Response({
        answers,
        test: testId,
        student: req.user.id,
        classId: req.user.classId,
        score: marksObtained,
      });
    }

    await newResponse.save();

    console.log("New response submitted", newResponse);
    return res
      .status(201)
      .json({ message: "New response submitted", data: newResponse });
  } catch (error) {
    console.log("Error submitting response", error);
    return res
      .status(500)
      .json({ message: "Error submitting response", data: error });
  }
};

export const generateResult = async (req, res) => {
  const { feedback, testId } = req.body;
  const studentId = req.user.id;

  try {
    const obtainedMarks = await Response.findOne({
      test: testId,
      student: studentId,
    }).select("score -_id");
    console.log(obtainedMarks, "score");

    const newResult = new Result({
      student: req.user.id,
      test: testId,
      feedback,
      score: obtainedMarks.score,
    });

    await newResult.save();
    console.log("Result generated : ", newResult);
    return res
      .status(201)
      .json({ message: "Result Generated ", data: newResult });
  } catch (error) {
    console.log("Error generating result : ", error);
    return res
      .status(201)
      .json({ message: "Error generating result ", data: error });
  }
};

export const fetchResult = async (req, res) => {
  try {
    const testId = new ObjectId(req.params.testId);
    const studentId = new ObjectId(req.user.id);

    console.log("t", typeof testId);
    console.log("s", studentId);

    const resultDetails = await Response.findOne({
      test: testId,
      student: req.user.id,
    })
    .populate({
      path: "answers.question",
      select: "answer marks",
    })
    .populate({
      path: "test", // Ensure that `test` is the correct field name referencing the Test model
      select: "responsePdfUrl", // Only select the `responsePdfUrl` field from the `Test` document
    })
    .select("answers score responsePdfUrl");

    // const resultDetails = await Response.aggregate([
    //   {
    //     $match: {
    //       test: testId,
    //       student: studentId,
    //     },
    //   },
    //   {
    //     $lookup: {
    //       from: "tests",
    //       localField: "test",
    //       foreignField: "_id",
    //       as: "testDetails",
    //     },
    //   },
    //   {
    //     $unwind: {
    //       path: "$testDetails",
    //       preserveNullAndEmptyArrays: true, // Ensures no errors if `testDetails` is missing
    //     },
    //   },
    //   {
    //     $project: {
    //       score: 1,
    //       responsePdfUrl: 1, // PDF URL from `Response` document
    //       testResponsePdfUrl: "$testDetails.responsePdfUrl", // PDF URL from `Test` document
    //     },
    //   },
    // ]);

    console.log(resultDetails);
    return res
      .status(200)
      .json({ message: "Fetched result", data: resultDetails });
  } catch (error) {
    console.log("Error fetching results", error);
    return res
      .status(500)
      .json({ message: "Error fetching results", data: error });
  }
};

export const fetchResultForTeacher = async (req, res) => {
  try {
    let testId = req.params.testId;
    let classId = req.user.classId;
    classId = new mongoose.Types.ObjectId(classId);
    testId = new mongoose.Types.ObjectId(testId);
    console.log(typeof classId);

    const resultDetails = await Class.aggregate([
      {
        $match: { _id: classId }, // Match the class by its ID
      },
      {
        $unwind: "$students", // Unwind the students array to process each student individually
      },
      {
        $lookup: {
          from: "responses", // Lookup the response model (responses collection)
          let: { studentId: "$students" }, // Pass the student ID to the lookup
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$student", "$$studentId"] }, // Match the student ID
                    { $eq: ["$test", new ObjectId(testId)] }, // Match the test ID
                  ],
                },
              },
            },
            {
              $project: { _id: 1, score: 1, responsePdfUrl: 1 },
            },
          ],
          as: "responseDetails", // This will hold the response details for each student
        },
      },
      {
        $lookup: {
          from: "students",
          localField: "students",
          foreignField: "_id",
          as: "studentName",
        },
      },
      {
        $addFields: {
          responseId: { $arrayElemAt: ["$responseDetails._id", 0] },
          responsePdfUrl: {
            $arrayElemAt: ["$responseDetails.responsePdfUrl", 0],
          },
          studentId: { $arrayElemAt: ["$studentName._id", 0] },
          fullName: { $arrayElemAt: ["$studentName.fullname", 0] }, // Get the full name from the joined studentInfo array
          score: {
            $ifNull: [{ $arrayElemAt: ["$responseDetails.score", 0] }, 0], // If response exists, get score; otherwise, 0
          },
          status: {
            $cond: {
              if: { $gt: [{ $size: "$responseDetails" }, 0] }, // If response exists, mark as "Present"
              then: "Present",
              else: "Absent", // If no response, mark as "Absent"
            },
          },
        },
      },
      {
        $project: {
          responseId: 1,
          responsePdfUrl: 1,
          studentId: 1,
          fullName: 1, // Show the student details (name, etc.)
          score: 1, // Show the score
          status: 1, // Show the status ("Present" or "Absent")
        },
      },
    ]);

    console.log(resultDetails);
    return res
      .status(200)
      .json({ message: "Fetched result", data: resultDetails });
  } catch (error) {
    console.log("Error fetching results", error);
    return res
      .status(500)
      .json({ message: "Error fetching results", data: error });
  }
};

export const assignMarks = async (req, res) => {
  const { marks, responseId } = req.body;

  console.log("res", responseId);

  try {
    await Response.findByIdAndUpdate(responseId, {
      score: marks,
    });
    console.log("Assigned Score");
    return res.status(200).json({ message: "Assigned Score" });
  } catch (error) {
    console.log("Error assigning score", error);
    return res
      .status(500)
      .json({ message: "Error assigning score", data: error });
  }
};