// Cho `node --experimental-strip-types` chạy được các file src/lib import không đuôi ("./da"):
// gặp import tương đối không đuôi thì thử thêm ".ts". Chỉ dùng cho các bài kiểm trong scripts/.
import { register } from "node:module";
register("./ts-duoi-hook.mjs", import.meta.url);
