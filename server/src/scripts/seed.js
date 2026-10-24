// Seeds the DEVELOPMENT database with fictional users and reports.
//
//   npm run seed            -> only seeds an empty database
//   npm run seed -- --reset -> deletes existing app data first
//
// Every person, email address and item below is made up. The example.com
// domain is reserved for documentation, so these emails can never reach anyone.
import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { config } from '../config/env.js';
import { Claim } from '../models/Claim.js';
import { Item } from '../models/Item.js';
import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';

const DEMO_PASSWORD = 'Password123';
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

const USERS = [
  { key: 'admin', name: 'Ada Admin', email: 'admin@example.com', role: 'admin' },
  { key: 'alice', name: 'Alice Moreno', email: 'alice@example.com' },
  { key: 'ben', name: 'Ben Okafor', email: 'ben@example.com' },
  { key: 'chloe', name: 'Chloe Lindqvist', email: 'chloe@example.com' },
];

const ITEMS = [
  {
    key: 'lostWallet', owner: 'alice', type: 'lost', category: 'wallets-and-cards', date: daysAgo(3),
    title: 'Black leather wallet', location: 'Central Station',
    description: 'Black leather wallet with red stitching. Contains a library card and a museum pass.',
  },
  {
    key: 'foundWallet', owner: 'ben', type: 'found', category: 'wallets-and-cards', date: daysAgo(2),
    title: 'Found black wallet', location: 'Central Station, platform 4',
    description: 'Black leather wallet with red stitching found on a bench near the ticket machines.',
  },
  {
    key: 'foundKeys', owner: 'chloe', type: 'found', category: 'keys', date: daysAgo(1),
    title: 'Keys with a blue lanyard', location: 'City Library, second floor',
    description: 'Three keys on a blue lanyard with a small rubber duck keychain.',
  },
  {
    key: 'lostKeys', owner: 'ben', type: 'lost', category: 'keys', date: daysAgo(2),
    title: 'House keys on blue lanyard', location: 'City Library',
    description: 'Lost my keys on a blue lanyard, there is a yellow duck keychain attached.',
  },
  {
    key: 'lostPhone', owner: 'chloe', type: 'lost', category: 'electronics', date: daysAgo(6),
    title: 'Green phone in a clear case', location: 'Riverside Park',
    description: 'Green smartphone in a transparent case with a pressed flower behind it.',
  },
  {
    key: 'foundUmbrella', owner: 'alice', type: 'found', category: 'other', date: daysAgo(8),
    title: 'Red folding umbrella', location: 'Bus line 12',
    description: 'Red folding umbrella with white polka dots, left on the back seat.',
  },
  {
    key: 'foundScarf', owner: 'ben', type: 'found', category: 'clothing', date: daysAgo(4),
    title: 'Grey wool scarf', location: 'Old Town Café',
    description: 'Long grey wool scarf with tassels, left on a chair near the window.',
  },
  {
    key: 'lostDog', owner: 'alice', type: 'lost', category: 'pets', date: daysAgo(1),
    title: 'Small brown dog named Pixel', location: 'Riverside Park',
    description: 'Friendly small brown terrier with a green collar. Answers to Pixel.',
  },
  {
    key: 'resolvedBag', owner: 'chloe', type: 'found', category: 'bags', date: daysAgo(20),
    title: 'Blue backpack', location: 'University campus',
    description: 'Blue backpack with notebooks and a water bottle, found in lecture hall B.',
    status: 'resolved', resolvedAt: daysAgo(15),
  },
  {
    key: 'spam', owner: 'ben', type: 'found', category: 'other', date: daysAgo(1),
    title: 'Cheap watches for sale', location: 'Online',
    description: 'This is not a lost item, it is an advert. Used to demo the moderation queue.',
  },
];

async function main() {
  if (config.isProduction) throw new Error('Refusing to seed a production database.');
  const reset = process.argv.includes('--reset');

  await connectDatabase();
  await Promise.all([User, Item, Claim, Notification].map((m) => m.syncIndexes()));

  if ((await User.estimatedDocumentCount()) > 0) {
    if (!reset) {
      console.log('Database already has data. Run `npm run seed -- --reset` to replace it.');
      return;
    }
    await Promise.all([User, Item, Claim, Notification].map((m) => m.deleteMany({})));
    console.log('Existing data removed.');
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, config.BCRYPT_ROUNDS);
  const users = {};
  for (const u of USERS) {
    users[u.key] = await User.create({ name: u.name, email: u.email, role: u.role ?? 'user', passwordHash });
  }

  const items = {};
  for (const { key, owner, ...data } of ITEMS) {
    items[key] = await Item.create({ ...data, owner: users[owner]._id });
  }

  // Alice claims Ben's found wallet (pending, so Ben can try the review flow).
  await Claim.create({
    item: items.foundWallet._id,
    claimant: users.alice._id,
    itemOwner: users.ben._id,
    message: 'It has red stitching and my library card is in the left pocket. There is also a museum pass.',
  });
  await Notification.create({
    user: users.ben._id,
    type: 'claim_received',
    title: 'New claim for "Found black wallet"',
    body: 'Alice Moreno believes this item is theirs. Review the claim to accept or reject it.',
    link: `/items/${items.foundWallet._id}/claims`,
  });

  // A flagged report for the admin moderation queue.
  await Item.updateOne(
    { _id: items.spam._id },
    { $push: { flags: { user: users.chloe._id, reason: 'This is an advertisement, not a lost item.' } }, $inc: { flagCount: 1 } },
  );

  console.log(`Seeded ${USERS.length} users and ${ITEMS.length} reports.`);
  console.log(`Demo accounts (password for all: ${DEMO_PASSWORD}):`);
  for (const u of USERS) console.log(`  ${u.role === 'admin' ? 'admin' : 'user '}  ${u.email}`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
