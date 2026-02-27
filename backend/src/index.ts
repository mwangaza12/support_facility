import express from "express";
import type { Request, Response } from "express";
import "dotenv/config";

const app = express();
const port = process.env.PORT || 5000;

app.get("/", (req: Request,res: Response) => {
    res.send("Support Facility API")
});

app.listen(port, () => {
    console.log(`Support Facility API is running on http://localhost:${port} `);
})

