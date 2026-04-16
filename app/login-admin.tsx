import { lazyRoute } from "../lib/lazyRoute";
export default lazyRoute(() => import("./_screens/login-admin"));
