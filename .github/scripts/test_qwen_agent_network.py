import unittest

from qwen_agent_network import allowed, patch_paths


class PatchSafetyTests(unittest.TestCase):
    def test_source_paths_allowed(self):
        self.assertTrue(allowed('api/management-webhook.ts'))
        self.assertTrue(allowed('stream-service/server.js'))
        self.assertTrue(allowed('test/bot.test.js'))

    def test_sensitive_paths_rejected(self):
        for path in ('.env', 'api/../.env', 'node_modules/pkg/index.js', 'stream-service/secrets.json', '/tmp/out'):
            self.assertFalse(allowed(path))

    def test_valid_update(self):
        patch = 'diff --git a/api/a.ts b/api/a.ts\n--- a/api/a.ts\n+++ b/api/a.ts\n@@ -1 +1 @@\n-old\n+new\n'
        self.assertEqual(patch_paths(patch), ['api/a.ts'])

    def test_new_file_allowed(self):
        patch = 'diff --git a/test/new.test.js b/test/new.test.js\nnew file mode 100644\n--- /dev/null\n+++ b/test/new.test.js\n@@ -0,0 +1 @@\n+test\n'
        self.assertEqual(patch_paths(patch), ['test/new.test.js'])

    def test_deletion_rejected(self):
        patch = 'diff --git a/test/old.test.js b/test/old.test.js\ndeleted file mode 100644\n--- a/test/old.test.js\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\n'
        with self.assertRaises(ValueError):
            patch_paths(patch)

    def test_rename_rejected(self):
        patch = 'diff --git a/api/old.ts b/api/new.ts\nsimilarity index 100%\nrename from api/old.ts\nrename to api/new.ts\n'
        with self.assertRaises(ValueError):
            patch_paths(patch)

    def test_path_traversal_rejected(self):
        patch = 'diff --git a/api/a.ts b/api/../.env\n--- a/api/a.ts\n+++ b/api/../.env\n@@ -1 +1 @@\n-old\n+new\n'
        with self.assertRaises(ValueError):
            patch_paths(patch)


if __name__ == '__main__':
    unittest.main()
