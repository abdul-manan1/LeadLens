/**
 * Common given names used to gate owner-name extraction. Precision matters more
 * than recall here because a detected owner feeds the score; a missed owner just
 * leaves the field blank for the user to fill.
 */
const NAMES = `
james john robert michael william david richard joseph thomas charles christopher daniel matthew anthony mark donald steven paul andrew joshua kenneth kevin brian george timothy ronald edward jason jeffrey ryan jacob gary nicholas eric jonathan stephen larry justin scott brandon benjamin samuel gregory alexander frank patrick raymond jack dennis jerry tyler aaron jose adam nathan henry douglas zachary peter kyle noah ethan jeremy walter christian keith roger terry austin sean gerald carl harold dylan arthur lawrence jordan jesse bryan billy bruce gabriel joe logan albert willie alan eugene randy wayne elijah vincent russell louis philip bobby johnny bradley craig ken tom bob jim mike dave rick rich chris steve dan matt tony andy jeff greg nick jon alex ben sam pat ray phil jake will al ed ted fred hank
mary patricia jennifer linda elizabeth barbara susan jessica sarah karen lisa nancy betty margaret sandra ashley kimberly emily donna michelle carol amanda dorothy melissa deborah stephanie rebecca sharon laura cynthia kathleen amy angela shirley anna brenda pamela emma nicole helen samantha katherine christine debra rachel carolyn janet catherine maria heather diane ruth julie olivia joyce virginia victoria kelly lauren christina joan evelyn judith megan andrea cheryl hannah jacqueline martha gloria teresa ann sara madison frances kathryn janice jean abigail alice judy sophia grace denise amber doris marilyn danielle beverly isabella theresa diana natalie brittany charlotte marie kayla alexis lori kim sue jan pam deb beth liz kate kathy cindy jill peggy lynn jo carrie tracy tina wendy julia juli molly holly erin
carlos luis jorge miguel juan pedro ricardo roberto fernando francisco javier rafael manuel alejandro eduardo antonio sergio raul hector diego mario oscar ruben cesar armando alberto arturo ramon enrique guillermo salvador josue jesus angel ivan omar victor
maria ana rosa carmen lucia elena teresa patricia guadalupe isabel gabriela adriana veronica claudia laura marta silvia monica sofia alejandra paula daniela mercedes yolanda gloria alicia beatriz esperanza rocio
wei li ming hui jun ling yan fang ping hong xin yu chen wang liu zhang yang huang zhao wu zhou xu sun ma zhu hu guo he lin gao luo zheng
amit raj priya anil sanjay rahul vijay sunil ravi ajay deepak arun rajesh suresh ramesh manoj vikram neha pooja anjali kavita sunita rekha meena
ahmed mohamed mohammed ali omar hassan hussein khalid ibrahim yusuf mustafa tariq samir karim fatima aisha layla zainab noor sara
hiroshi takeshi kenji yuki akira taro kazuki haruto yui sakura aoi hana mei
minh anh tuan hung duc long linh mai thao trang nguyen tran le pham
sung min jin young joon hyun ji soo eun seo woo
olga natalia svetlana irina tatiana elena ekaterina anna dmitri sergei andrei alexei ivan vladimir mikhail nikolai pavel
kwame kofi ade chidi emeka ngozi amara adaeze tunde femi ayo
stan gus lou vic art rex hal les nate zach drew kurt lars sven erik nils jens ole hans klaus dieter jurgen rolf otto max felix lukas jonas leon finn
`
  .split(/\s+/)
  .filter(Boolean);

export const FIRST_NAMES = new Set(NAMES);

export function looksLikeFirstName(token: string): boolean {
  const t = token.toLowerCase().replace(/[^a-z.]/g, "");
  if (!t) return false;
  if (/^([a-z]\.){1,2}$/.test(t)) return true; // initials: "J." or "L.A."
  return FIRST_NAMES.has(t);
}
