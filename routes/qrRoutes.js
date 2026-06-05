const router = require("express").Router();
const auth = require("../middleware/auth");
const {
  createQR,
  getAllQR,
  deleteQR,
  getQRForGuard,
} = require("../controllers/qrController");
router.post("/", auth(["supervisor"]), createQR);
router.get("/", auth(["employee", "supervisor"]), getAllQR);
router.delete("/:id", auth(["employee", "supervisor"]), deleteQR);

router.get("/list", auth(["guard", "supervisor"]), getQRForGuard);
module.exports = router;
