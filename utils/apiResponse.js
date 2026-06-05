// utils/apiResponse.js
class ApiResponse {
  constructor(success=true, msg="", data = null) {
    this.success = success;
    this.msg = msg;
    this.data = data;
  }
}
module.exports = ApiResponse;
