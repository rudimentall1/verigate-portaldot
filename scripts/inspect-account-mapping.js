const { inspectAccountMapping } = require("./portaldot-address.js");

function main(args = process.argv.slice(2)) {
  if (args.length < 1 || args.length > 2) {
    throw new Error("Usage: npm run address:inspect -- <SS58-AccountId32> [candidate-H160]");
  }
  const result = inspectAccountMapping(args[0], args[1] || "");
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Account mapping inspection failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { main };
