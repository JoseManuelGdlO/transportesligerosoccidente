import { Navigate } from "react-router-dom";

/** Ruta legacy no usada en el router principal; redirige al dashboard. */
export default function Index() {
  return <Navigate to="/" replace />;
}
