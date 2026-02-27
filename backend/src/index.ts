import express from "express";
import type { Request, Response } from "express";
import "dotenv/config";
import { drizzle } from "drizzle-orm/neon-serverless";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const port = process.env.PORT || 5000;

const db = drizzle(process.env.DATABASE_URL!);

app.get("/", (req: Request,res: Response) => {
    res.send("Support Facility API")
});

app.listen(port, () => {
    console.log(`Support Facility API is running on http://localhost:${port} `);
})

