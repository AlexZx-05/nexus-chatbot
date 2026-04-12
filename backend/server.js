import cors from "cors";
import express from "express";

const app = express();
app.use(cors());
app.use(express.json());

function resolveEmotion(message, failed) {
  if (failed) {
    return "error";
  }
  const text = String(message || "").trim().toLowerCase();
  if (!text || text.length < 3 || !/[a-zA-Z]/.test(text)) {
    return "confused";
  }
  if (
    text.includes("hi") ||
    text.includes("hello") ||
    text.includes("thanks") ||
    text.includes("thank you")
  ) {
    return "welcome";
  }
  return "neutral";
}

function resolveReply(message) {
  const text = String(message || "").toLowerCase();
  if (text.includes("admission")) {
    return "I can help with admissions. Tell me your course and intake.";
  }
  if (text.includes("fees") || text.includes("payment")) {
    return "I can help with fee details. Share your program and semester.";
  }
  if (text.includes("hostel")) {
    return "I can help with hostel information. Which campus are you asking about?";
  }
  if (!text || text.length < 3 || !/[a-zA-Z]/.test(text)) {
    return "Could you rephrase your question with a little more detail?";
  }
  return "Thanks for your message. I can help with admission, fees, hostel, and timetable.";
}

app.post("/api/chat", async (req, res) => {
  const { message } = req.body || {};
  try {
    const reply = resolveReply(message);
    const emotion = resolveEmotion(message, false);
    return res.json({ reply, emotion });
  } catch (error) {
    return res.status(500).json({
      reply: "Sorry, something went wrong. Please try again.",
      emotion: "error",
    });
  }
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`Emotion backend running at http://localhost:${port}`);
});
