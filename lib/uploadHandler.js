const { NextResponse } = require("next/server");
const { getRuntime } = require("./runtime");

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

async function handleUploadRequest(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const filename = file.name || "timetable.xlsx";
    if (!/\.(xlsx|xls)$/i.test(filename)) {
      return NextResponse.json(
        { error: "Only .xlsx and .xls Excel files are supported" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Uploaded file exceeds 15 MB limit" },
        { status: 400 }
      );
    }

    const { store, isVercel } = getRuntime();
    const courses = store.replaceFromWorkbookBuffer(Buffer.from(arrayBuffer), filename);

    return NextResponse.json({
      success: true,
      filename,
      courseCount: courses.length,
      ephemeral: isVercel,
      stats: store.getStats(),
      structured: courses
    });
  } catch (error) {
    console.error("Excel upload error:", error);
    return NextResponse.json({ error: "Failed to parse Excel timetable file" }, { status: 500 });
  }
}

module.exports = { handleUploadRequest };
