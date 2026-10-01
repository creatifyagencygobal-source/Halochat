const path = require("path");
const multer = require("multer");
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const FILE_EXTENSIONS = new Set([".pdf", ".docx", ".txt", ".zip", ".csv", ".pptx", ".xlsx"]);
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const FILE_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "application/zip",
  "application/x-zip-compressed",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
function allowed(file, imagesOnly = false) {
  const ext = path.extname(file.originalname).toLowerCase();
  return imagesOnly
    ? IMAGE_EXTENSIONS.has(ext) && IMAGE_MIMES.has(file.mimetype)
    : (IMAGE_EXTENSIONS.has(ext) && IMAGE_MIMES.has(file.mimetype)) || (FILE_EXTENSIONS.has(ext) && FILE_MIMES.has(file.mimetype));
}
function imageSignature(buffer) {
  return (
    (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) ||
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    (buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP")
  );
}
function fileSignature(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (IMAGE_MIMES.has(file.mimetype)) return imageSignature(file.buffer);
  if (file.mimetype === "application/pdf") return file.buffer.subarray(0, 5).toString() === "%PDF-";
  if (["application/zip", "application/x-zip-compressed"].includes(file.mimetype) || [".docx", ".pptx", ".xlsx"].includes(ext)) return file.buffer[0] === 0x50 && file.buffer[1] === 0x4b;
  return !file.buffer.includes(0);
}
const storage = multer.memoryStorage();
const mediaUpload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024, files: 10, fields: 4 }, fileFilter: (req, file, cb) => cb(null, allowed(file)) }).array("attachments", 10);

const avatarMulter = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    if (!allowed(file, true)) {
      return cb(new Error("Unsupported file type."));
    }

    cb(null, true);
  },
});

const avatarUpload = (req, res, next) => {
  avatarMulter.single("avatar")(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      return res.status(400).json({
        success: false,
        message: error.code === "LIMIT_FILE_SIZE" ? "Image must be 5 MB or smaller." : "Upload limit exceeded.",
      });
    }

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || "Unsupported file type.",
      });
    }

    next();
  });
};
function validateMediaFiles(req, res, next) {
  if (!req.files?.length) return res.status(400).json({ success: false, message: "Choose at least one attachment." });
  if (req.files.some((file) => IMAGE_MIMES.has(file.mimetype) && file.size > 5 * 1024 * 1024)) return res.status(400).json({ success: false, message: "Images must be 5 MB or smaller." });
  if (req.files.some((file) => !fileSignature(file))) return res.status(400).json({ success: false, message: "One or more files do not match their declared type." });
  next();
}
function validateAvatar(req, res, next) {
  if (!req.file) return res.status(400).json({ success: false, message: "Choose a JPG, PNG, or WebP image." });
  if (!imageSignature(req.file.buffer)) return res.status(400).json({ success: false, message: "The selected file is not a valid image." });
  next();
}
function uploadErrorHandler(error, req, res, next) {
  if (error instanceof multer.MulterError) return res.status(400).json({ success: false, message: error.code === "LIMIT_FILE_SIZE" ? "File is too large." : "Upload limit exceeded." });
  if (error) return res.status(400).json({ success: false, message: "Unsupported file type." });
  next();
}
module.exports = { IMAGE_MIMES, mediaUpload, avatarUpload, validateMediaFiles, validateAvatar, uploadErrorHandler, fileSignature, imageSignature };
