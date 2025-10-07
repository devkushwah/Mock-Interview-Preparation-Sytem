import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const createUser = mutation( {
    args: {
        name: v.string(),
        email: v.string(),
    },

    handler: async (ctx, args) => {
        const userData = await ctx.db.query("users")
        .filter("email", "==", args.email)
        .first();

        if (userData) {
            throw new Error("User already exists");
        }

        const newUser = await ctx.db.insert("users", {
            name: args.name,
            email: args.email,
            credit: 50000,
        });

        return newUser; // newUser is already the ID
    }
})