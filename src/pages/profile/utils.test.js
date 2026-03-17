import {
  buildNormalizedUser,
  formatMegabytes,
  normalizeNamePart,
  splitFullName,
} from "./utils";

describe("profile/utils", () => {
  test("normalizeNamePart trims and collapses whitespace", () => {
    expect(normalizeNamePart("  Ivan   Petrov  ")).toBe("Ivan Petrov");
    expect(normalizeNamePart(null)).toBe("");
  });

  test("splitFullName splits last, first and middle name parts", () => {
    expect(splitFullName("  Иванов   Иван  Иванович ")).toEqual({
      lastName: "Иванов",
      firstName: "Иван",
      middleName: "Иванович",
    });
  });

  test("splitFullName falls back to single token for both lastName and firstName", () => {
    expect(splitFullName("Plato")).toEqual({
      lastName: "Plato",
      firstName: "Plato",
      middleName: "",
    });
  });

  test("buildNormalizedUser uses explicit normalized fields when present", () => {
    expect(
      buildNormalizedUser({
        firstName: "  Ada ",
        lastName: "  Lovelace ",
        middleName: "  Byron ",
        email: "  ADA@EXAMPLE.COM ",
        avatarDataUrl: "avatar:data",
      })
    ).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace",
      middleName: "Byron",
      email: "ada@example.com",
      avatarDataUrl: "avatar:data",
    });
  });

  test("buildNormalizedUser falls back to split full name and empty avatar", () => {
    expect(
      buildNormalizedUser({
        name: "Иванов Иван Иванович",
        email: "USER@EXAMPLE.COM",
      })
    ).toMatchObject({
      firstName: "Иван",
      lastName: "Иванов",
      middleName: "Иванович",
      email: "user@example.com",
      avatarDataUrl: "",
    });
  });

  test("formatMegabytes formats whole and fractional megabytes", () => {
    expect(formatMegabytes(1024 * 1024)).toBe("1");
    expect(formatMegabytes(1.5 * 1024 * 1024)).toBe("1.5");
  });
});
