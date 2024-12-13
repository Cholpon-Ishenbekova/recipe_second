// Read JSON-File from Server
let importedRecipes;
var xmlhttp = new XMLHttpRequest();

xmlhttp.onreadystatechange = function () {
  if (this.readyState == 4 && this.status == 200) {
    importedRecipes = JSON.parse(this.responseText); // Parse the JSON response from the server
  }
};

xmlhttp.open(
  "GET",
  "https://raw.githubusercontent.com/Cholpon-Ishenbekova/recipe_second/refs/heads/main/recipes.json",
  false // Synchronous request to fetch recipes
);

xmlhttp.send();

// Add a `selected` property to each recipe to track whether it's selected in the GUI
importedRecipes.forEach(function (recipe) {
  recipe.selected = false;
});

/* Get the collection of recipes and sort them for randomization */
function getRecipeCollection() {
  let recipes = [];
  // Randomize recipes to encourage diversity in meal planning
  importedRecipes.sort(function () {
    return 0.5 - Math.random();
  });

  // Get unique priority levels
  let uniquePriorities = getUniquePriorities();

  // Group recipes by priority level
  uniquePriorities.forEach((priority) => {
    recipes.push(
      importedRecipes.filter(function (recipe) {
        return recipe.priority == priority;
      })
    );
  });

  // Flatten the nested array structure
  recipes = [].concat(...recipes);

  return recipes;
}

/* Get unique priority levels from the recipes */
function getUniquePriorities() {
  let priorities = importedRecipes.map(function (recipe) {
    return parseInt(recipe.priority);
  });

  let uniquePriorities = [...new Set(priorities)]; // Remove duplicates
  return uniquePriorities.sort(); // Return sorted priority levels
}

/* Generate a collection of randomized recipes */
const recipeCollection = getRecipeCollection();

/* Aggregate selected recipes' ingredients into a shopping list */
function filterSelectedAndAggregateAmounts(recipes) {
  const ingredients = {};

  let filteredRecipes = recipes.filter((recipe) => recipe.selected == true);

  filteredRecipes.forEach((recipe) => {
    recipe.ingredients.forEach((ing) => {
      if (!ingredients[ing.name]) {
        // Add ingredient if not already in the list
        ingredients[ing.name] = {
          unit: ing.unit,
          amount: ing.amount,
          department: ing.department, // Department (e.g., dairy, produce)
        };
      } else {
        // Aggregate amounts of the same ingredient
        ingredients[ing.name].amount += ing.amount;
      }
    });
  });

  return ingredients;
}

/* Vue Component for Meal Selection */
Vue.component("my-meal", {
  props: ["recipe", "recipes", "index"],
  methods: {
    toggleSelectedRecipe: function () {
      // Toggle the selection of a recipe
      this.recipes[this.index].selected = !this.recipes[this.index].selected;
    },
  },
  template:
    '<a href="javascript:void(0);" class="list-group-item list-group-item-action" v-bind:class="{active: recipes[index].selected}" v-on:click="toggleSelectedRecipe"> {{ recipe.recipeName }}</a>',
});

/* Vue Instance for Managing Recipes and Shopping List */
var vm = new Vue({
  el: "#app",
  data: {
    recipes: recipeCollection,
  },
  methods: {
    onCopy: function (e) {
      alert(
        "The following list has been copied to the clipboard:\n\n" + e.text
      ); // Alert success
    },
    onError: function (e) {
      alert("Error copying to clipboard."); // Alert error
    },
  },
  computed: {
    /* Generate the shopping list from selected recipes */
    shoppingList: function () {
      const ingredients = filterSelectedAndAggregateAmounts(this.recipes);
      const lst = Object.keys(ingredients).map((name) => ({
        name: name,
        unit: ingredients[name].unit,
        amount: ingredients[name].amount,
        department: ingredients[name].department,
      }));

      // Sort ingredients alphabetically and by department
      lst.sort((l, r) => (l.name <= r.name ? -1 : 1));
      const sortedByDepartment = lst.sort(
        (l, r) => (l.department <= r.department ? 1 : -1)
      );

      return sortedByDepartment.map(
        (ing) => `${ing.amount} ${ing.unit} ${ing.name}`
      );
    },
    /* Prepare shopping list for clipboard */
    clipboardShoppingList: function () {
      const date = new Date();
      return (
        "Shopping list for " +
        date.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }) +
        ":\n" +
        this.shoppingList.join("\n")
      );
    },
    /* Prepare a summary of selected menus */
    clipboardMenues: function () {
      const selectedRecipesSorted = this.selectedRecipes
        .sort((l, r) => (l.recipeName >= r.recipeName ? 1 : -1))
        .sort((l, r) => (l.priority >= r.priority ? 1 : -1));

      const date = new Date();
      let output =
        "Menu list starting from " +
        date.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }) +
        ":\n" +
        selectedRecipesSorted
          .map((recipe) => recipe.recipeName)
          .join(", ")
          .toUpperCase() +
        "\n\n";

      selectedRecipesSorted.forEach((recipe) => {
        output +=
          recipe.recipeName.toUpperCase() +
          "\n" +
          "--------------------" +
          "\n";
        recipe.ingredients.forEach((ingredient) => {
          output += `${ingredient.amount} ${ingredient.unit} ${ingredient.name}\n`;
        });
        output +=
          `\n"${recipe.comment}" Priority ${recipe.priority}\n\n\n`;
      });

      return output;
    },
    selectedRecipes: function () {
      return this.recipes.filter((recipe) => recipe.selected == true);
    },
  },
});

// AI Search Implementation
async function getEmbeddings(text) {
  const response = await fetch('https://api-inference.huggingface.co/models/bert-base-uncased', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer YOUR_ACCESS_TOKEN' },
    body: JSON.stringify({ inputs: text }),
  });
  const data = await response.json();
  return data[0].embedding;
}

async function searchRecipes(query) {
  const queryVector = await getEmbeddings(query);
  const recipes = getRecipeCollection(); // Assuming this function retrieves the recipe data

  const scores = recipes.map(async (recipe) => {
    const recipeVector = await getEmbeddings(recipe.recipeName);
    return { ...recipe, similarity: cosineSimilarity(queryVector, recipeVector) };
  });

  return scores.sort((a, b) => b.similarity - a.similarity);  // Sorting based on similarity
}

function cosineSimilarity(v1, v2) {
  const dotProduct = v1.reduce((sum, value, idx) => sum + value * v2[idx], 0);
  const magnitude1 = Math.sqrt(v1.reduce((sum, value) => sum + value * value, 0));
  const magnitude2 = Math.sqrt(v2.reduce((sum, value) => sum + value * value, 0));
  return dotProduct / (magnitude1 * magnitude2);
}
