/**
 * Tool definitions for the AI chat agent
 * Tools can either require human confirmation or execute automatically
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod/v3";

import type { Chat } from "./server";
import { getCurrentAgent } from "agents";
import { scheduleSchema } from "agents/schedule";

/**
 * Weather information tool that requires human confirmation
 * When invoked, this will present a confirmation dialog to the user
 */
const getWeatherInformation = tool({
  description: "show the weather in a given city to the user",
  inputSchema: z.object({ city: z.string() })
  // Omitting execute function makes this tool require human confirmation
});

/**
 * Local time tool that executes automatically
 * Since it includes an execute function, it will run without user confirmation
 * This is suitable for low-risk operations that don't need oversight
 */
const getLocalTime = tool({
  description: "get the local time for a specified location",
  inputSchema: z.object({ location: z.string() }),
  execute: async ({ location }) => {
    console.log(`Getting local time for ${location}`);
    return "10am";
  }
});

const scheduleTask = tool({
  description: "A tool to schedule a task to be executed at a later time",
  inputSchema: scheduleSchema,
  execute: async ({ when, description }) => {
    // we can now read the agent context from the ALS store
    const { agent } = getCurrentAgent<Chat>();

    function throwError(msg: string): string {
      throw new Error(msg);
    }
    if (when.type === "no-schedule") {
      return "Not a valid schedule input";
    }
    const input =
      when.type === "scheduled"
        ? when.date // scheduled
        : when.type === "delayed"
          ? when.delayInSeconds // delayed
          : when.type === "cron"
            ? when.cron // cron
            : throwError("not a valid schedule input");
    try {
      agent!.schedule(input!, "executeTask", description);
    } catch (error) {
      console.error("error scheduling task", error);
      return `Error scheduling task: ${error}`;
    }
    return `Task scheduled for type "${when.type}" : ${input}`;
  }
});

/**
 * Tool to list all scheduled tasks
 * This executes automatically without requiring human confirmation
 */
const getScheduledTasks = tool({
  description: "List all tasks that have been scheduled",
  inputSchema: z.object({}),
  execute: async () => {
    const { agent } = getCurrentAgent<Chat>();

    try {
      const tasks = agent!.getSchedules();
      if (!tasks || tasks.length === 0) {
        return "No scheduled tasks found.";
      }
      return tasks;
    } catch (error) {
      console.error("Error listing scheduled tasks", error);
      return `Error listing scheduled tasks: ${error}`;
    }
  }
});

/**
 * Tool to cancel a scheduled task by its ID
 * This executes automatically without requiring human confirmation
 */
const cancelScheduledTask = tool({
  description: "Cancel a scheduled task using its ID",
  inputSchema: z.object({
    taskId: z.string().describe("The ID of the task to cancel")
  }),
  execute: async ({ taskId }) => {
    const { agent } = getCurrentAgent<Chat>();
    try {
      await agent!.cancelSchedule(taskId);
      return `Task ${taskId} has been successfully canceled.`;
    } catch (error) {
      console.error("Error canceling scheduled task", error);
      return `Error canceling task ${taskId}: ${error}`;
    }
  }
});

const planTrip = tool({
  description: "Plan a detailed trip itinerary and automatically generate Google Maps links for each day.",
  inputSchema: z.object({
    destination: z.string().describe("The main location for this trip (can be a city, region, or country). The itinerary should remain specific even for large regions."),
    start_date: z.string().describe("The starting date of the trip."),
    end_date: z.string().describe("The ending date of the trip."),
    interests: z.array(z.string()).optional().describe("User interests or activities to tailor the itinerary."),
    friends: z.array(z.string()).optional().describe("Friends joining the trip.")
  }),

  execute: async ({ destination, start_date, end_date, interests, friends }) => {
    // --- Duration Calculation ---
    const tripLength = (() => {
      const start = new Date(start_date);
      const end = new Date(end_date);
      const days = Math.max(1, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      return Math.ceil(days);
    })();

    // --- Regional Expansion Logic ---
    const regionToCities: Record<string, string[]> = {
      california: ["Los Angeles", "San Francisco", "San Diego", "Yosemite National Park"],
      japan: ["Tokyo", "Kyoto", "Osaka", "Hiroshima"],
      italy: ["Rome", "Florence", "Venice", "Milan"],
      france: ["Paris", "Nice", "Lyon", "Bordeaux"],
      spain: ["Barcelona", "Madrid", "Seville", "Valencia"],
      india: ["Delhi", "Jaipur", "Agra", "Mumbai"],
      greece: ["Athens", "Santorini", "Mykonos", "Crete"]
    };

    const normalized = destination.toLowerCase();
    const subDestinations = regionToCities[normalized] || [destination];

    // --- Example Locations ---
    const exampleRestaurants = [
      "Blue Bottle Coffee",
      "The Grove Café",
      "The Local Diner",
      "Harbor View Seafood Grill",
      "Mountain Bistro",
      "Sunset Terrace"
    ];

    const exampleActivities = [
      "city walking tour",
      "museum visit",
      "boat ride",
      "scenic lookout",
      "shopping district",
      "local market exploration",
      "fine dining experience"
    ];

    // --- Generate the itinerary ---
    const itinerary: string[] = [];
    for (let i = 0; i < tripLength; i++) {
      const day = i + 1;
      const city = subDestinations[i % subDestinations.length]; // rotate across sub-locations

      itinerary.push(
        `**Day ${day} — ${city}**  
- **08:00 AM:** Breakfast at ${exampleRestaurants[(i * 3) % exampleRestaurants.length]}  
- **10:00 AM:** ${exampleActivities[(i * 4) % exampleActivities.length]} in ${city}  
- **12:30 PM:** Lunch at ${exampleRestaurants[(i * 3 + 1) % exampleRestaurants.length]}  
- **03:00 PM:** ${exampleActivities[(i * 2 + 1) % exampleActivities.length]} nearby  
- **07:30 PM:** Dinner at ${exampleRestaurants[(i * 3 + 2) % exampleRestaurants.length]}  
`
      );
    }

    // --- Combine everything into a detailed itinerary ---
    const fullItinerary = `
Trip to **${destination}**  
${friends ? `Traveling with: ${friends.join(", ")}` : ""}
${interests ? `Traveler interests: ${interests.join(", ")}` : ""}

Here’s your detailed itinerary:
${itinerary.join("\n")}
    `.trim();

    // --- Generate Google Maps links (via your existing tool) ---
    const mapLinks = await tools.generateMapLinks.execute({
      itinerary: fullItinerary,
      destination
    });

    return `${fullItinerary}\n\n${mapLinks}`;
  }
});


const sendEmail = tool({
  description: "Send an email with the most up to date trip itinerary with a subject and body to a list of recipients",
  inputSchema: z.object({
    to: z.array(z.string().email()).describe("A list of email addresses to send the itinerary to."),
    subject: z.string().describe("The subject line of the email."),
    body: z.string().describe("The body content of the email, including the trip itinerary. This will be plain text or HTML.")
  }),

  execute: async ({ to, subject, body }) => {
    const { agent } = getCurrentAgent<Chat>();
    const apiKey = agent!.env.SENDGRID_EMAIL_API;
    const from = agent!.env.SENDER_EMAIL;

    const cleanedBody = body.replace(/\*\*Day\s+(\d+)\s+—[^\*]+\*\*/g, '**Day $1**');

    const htmlTemplate = `
      <div style="font-family: Arial, sans-serif; background-color: #f9fafc; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden;">
          <div style="background-color: #0078d4; color: white; padding: 20px;">
            <h2 style="margin: 0;">Your Trip Itinerary 🌍</h2>
          </div>
          <div style="padding: 20px; line-height: 1.6; color: #333;">
            ${cleanedBody
              .replace(/#{1,6}\s*/g, "")
              .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
              .replace(/(Day\s\d+)/g, '<h3 style="color:#0078d4;margin-top:24px;">$1</h3>')
              .replace(/\n/g, "<br>")}
          </div>
          <div style="background-color: #f1f1f1; padding: 15px; text-align: center; font-size: 13px; color: #555;">
            ✈️ Planned with <strong>Trip Agent</strong> on Cloudflare AI
          </div>
        </div>
      </div>
    `;

    try {
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: to.map(email => ({ email })) }],
          from: { email: from },
          subject,
          content: [{ type: "text/html", value: htmlTemplate }],
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return `Failed to send email: ${error}`;
      }

      return `Email sent successfully to: ${to.join(", ")}`;
    } catch (error) {
      return `Error sending email: ${error}`;
    }
  },
});

const generateMapLinks = tool({
  description: "Generate clickable Google Maps links for each day in the itinerary, using inferred local context.",
  inputSchema: z.object({
    itinerary: z.string().describe("The full itinerary text generated by the trip planner."),
    destination: z.string().optional().describe("The overall trip destination. Optional when invoked by the trip planner.")
  }),
  execute: async ({ itinerary, destination }) => {
    const inferredDestination = destination || "the trip destination";
    const dayBlocks = itinerary.split(/\*\*Day\s+\d+/g).slice(1);
    const dayTitles = [...itinerary.matchAll(/\*\*Day\s+(\d+)[^*]*/g)].map(m => m[0].trim());

    const locationRegex = /\b(?:at|in|around|near|visit|explore|lunch at|dinner at)\s+([A-Z][\w'&\- ]+)/gi;
    const links: string[] = [];

    dayBlocks.forEach((block, index) => {
      const matches = [...block.matchAll(locationRegex)];
      const places = matches.map(m => m[1].trim());
      const localContextMatch = block.match(
        /\b(?:in|around|near|visit|explore)\s+([A-Z][\w'&\- ]+)/i
      );
      const localContext = localContextMatch
        ? localContextMatch[1].trim()
        : inferredDestination;

      if (places.length > 0) {
        const dailyLinks = places
          .map(place => {
            const query = `${place}, ${localContext}`;
            const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
            return `• [${place} (${localContext})](${url})`;
          })
          .join("\n");

        links.push(`**${dayTitles[index] || `Day ${index + 1}`}**\n${dailyLinks}`);
      } else {
        links.push(`**${dayTitles[index] || `Day ${index + 1}`}**\nNo recognizable locations found.`);
      }
    });

    return `
 **Google Maps Links for Each Day**

${links.join("\n\n")}
    `.trim();
  }
});


/**
 * Export all available tools
 * These will be provided to the AI model to describe available capabilities
 */
export const tools = {
  getWeatherInformation,
  getLocalTime,
  scheduleTask,
  getScheduledTasks,
  cancelScheduledTask,
  planTrip,
  sendEmail,
  generateMapLinks
} satisfies ToolSet;

/**
 * Implementation of confirmation-required tools
 * This object contains the actual logic for tools that need human approval
 * Each function here corresponds to a tool above that doesn't have an execute function
 */
export const executions = {
  getWeatherInformation: async ({ city }: { city: string }) => {
    console.log(`Getting weather information for ${city}`);
    return `The weather in ${city} is sunny`;
  }
};
