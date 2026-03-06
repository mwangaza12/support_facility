import { RouterProvider } from "react-router-dom"
import "./index.css"
import { Router } from "@/routes/Router"

function App() {

  return (
    <>
      <RouterProvider router={Router} />
    </>
  )
}

export default App
