# DevOpsBase

This repository contains the raw data of *DevOpsBase* (DevOps knowledge base or metadatabase) as structured content in different formats: JSON (`.json` files), XML (`.xml` files) and YAML (`.yaml` or `.yml` files).
These files are organized using a nested directory structure:

* `/gathered` contains data, crawled and automatically gathered using *GatherBase* from existing repositories such as Chef Supermarket, Juju Charm Store and Docker Hub.
* `/gathered-refined` includes JavaScript functions, which are used to refine specific parts of automatically gathered data.
* `/added` consists of data, manually added by experts to complement automatically gathered data.
* `/schema` holds definitions to be used to classify and specify the structure of implementations represented by both gathered and manually added data.

DevOpsBase consists of a broad variety of linked **implementations**:



## Implementations

An implementation can be any kind of solution such as:

* An executable (Shell script, Chef cookbook, virtual machine image, provisioning plan, etc.)
* A provider-hosted API (Amazon EC2, Amazon RDS, Google Container Engine, etc.)
* A library, toolkit or SDK (Amazon Java SDK, ChefDK, fog, jclouds, etc.)
* A command-line interface (Chef knife, etc.)
* A graphical user interface (Amazon Web Services Console, etc.)
* An orchestration tool (Terraform, Kubernetes, etc.)
* A textual document (tutorials, blog articles, installation guides, patterns, etc.)
* ...

Each implementation is uniquely identified by its **primary URI** (usually the website URL of the implementation).
In addition, DevOpsBase may contain multiple **revisions** of an implementation.
Each implementation is semantically described by a set of **labels**.
A label can either be an arbitrary string (e.g. a keyword or tag) or a **semantic label** according to one of the label taxonomies outlined in the following.



## Schema

### Label taxonomies

Several YAML files inside the `/schema/label_taxonomies` directory define hierarchies of classes/categories to be used for expressing semantic labels (i.e. paths in these hierarchies) and assigning them to implementations.
These are used for specifying solutions' capabilities and requirements.
A few examples:

* Type/Infrastructure/OS/Linux/Ubuntu
* Type/Middleware/Database/Relational/MySQL
* Type/Devopsware/Deployment/Chef
* Binding/Provider/Google/Compute Engine
* Mode/Executable/Script/Chef Cookbook

Such labels are used to systematically classify implementations in various dimensions. Currently, the following upper-level categories are defined:

* **Type/Infrastructure/...** - a label of this category denotes that the implementation provides an infrastructure solution such as a virtual machine image for a particular operating system
* **Type/Middleware/...** - means that the implementation provides some middleware such as a database server, runtime environment or message queuing server
* **Type/Devopsware/...** - in contrast to middleware, a corresponding implementation provides supplementary software, which is not part of the application stack itself, but enables its development and operations (DevOps) including deployment, monitoring, etc.
* **Binding/Provider/...** - means that an implementation is bound to a particular provider (e.g. cloud service API); it may also enable access to a provider (e.g. cloud API abstraction library)
* **Binding/Region/...** - means that an implementation is bound to a specific region (e.g. cloud service API that is only available in Europe)
* **Mode/...** - indicates the mode of use of an implementation such as API, GUI, CLI, executable, etc.
* **Style/...** - indicates the usage style of an implementation, e.g. on which virtualization level it can be used, etc.

In addition to labels, further properties can be assigned to implementations to specify its characteristics and potential usage.



### Templates

TODO: `/schema/templates` impl.json, impl.xml, impl.yml



### Implementation properties

An implementation may have arbitrary properties of basic types such as `string`, `number`, `boolean`, or composed types such as `array` and `object` (e.g. JSON array, JSON object, XML object).
The basic properties are:

* **name** `(string)` human-readable name of the implementation
* **revision** `(string)`
* **latest** `(boolean)` indicates whether this is the latest revision of the implementation
* **labels** `(array of strings)`
* **uris** `(array of strings)`
* **info_url** `(string)`
* **description** `(string)` short summary of the implementation
* **readme** `(string)` more extensive information how to use the implementation
* **maintainer** `(object)`
  * **name** `(string)`
  * **email** `(string)`
* **parameters** `(object)`
  * *{parameter_name}* `(object)`
    * **type** `(string)`
    * **description** `(string)`
    * **default** `(string)`
    * **mapping** `(string)`

The first entry of the *uris* array represents the primary URI for an implementation.
Additional properties are utilized to define links and relations between implementations.
Furthermore, requirements and capabilities can be defined.

* **provides** `(array of objects)`
  * `(object)`
    * **label** | **uri** `(string)`
    * **version** `(string)` specific version or version range ([semver syntax](https://github.com/npm/node-semver)) of this implementation
* **requires** `(array of objects)`
  * `(object)`
    * **kind** `"host" | "peer" | "env"`
    * **label** | **uri** `(string)`
    * **revision** | **version** `(string)` specific revision/version or revision/version range ([semver syntax](https://github.com/npm/node-semver)) of required implementation
    * **self_resolve** `(boolean)` indicates whether this requirement is resolved by the implementation itself
    * **one_of_group** `(string)` name of a specific group of requirements that are alternatives, i.e. only one of them must be satisfied
* **recommends** `(array of objects)`
  * `(object)`
    * **label** | **uri** `(string)`
    * **revision** | **version** `(string)` specific revision/version or revision/version range ([semver syntax](https://github.com/npm/node-semver)) of recommended implementation
* **conflicts** `(array of objects)`
  * `(object)`
    * **label** | **uri** `(string)`
    * **revision** | **version** `(string)` specific revision/version or revision/version range ([semver syntax](https://github.com/npm/node-semver)) of conflicting implementation

The *provides* property can be used to define more fine-grained capabilities in addition to labels such as specific versions that are provided by an implementation.
For example, a particular deployment script can only install a MySQL database in a specific version.
The *requires* property can be used to define different kinds of requirements and dependencies: *host* means that another implementation is required to serve as a host.
This could be, for example, a virtual machine on which a deployment script is executed.
A *peer* dependency means that an implementation is somehow connected to another implementation, for example, an application component that connects to a database, which is potentially running on another host or is hosted as a service.
An *env* dependency is an implementation that is required in the same hosting environment (VM, container, etc.).
This could be, for example, a script that depends on a certain binary, which must be installed before the script can be executed.



### Label properties

The previously outlined implementation properties can also be attached to labels as part of the label taxonomies.
As a result, these properties are propagated to all implementations that are categorized under a specific label.
In addition, label properties can be specified:

* **alias** `(array of strings)` list of label aliases
* **definitive_keywords** `(array of strings)` list of definitive keywords that are used to characterize a specific label
* **shadow_keywords** `(array of strings)` list of shadow keywords that are used to characterize a specific label; a shadow keyword is only considered if no other label defines it as definitive keyword
* **keyword_from_label** `(boolean)` derive keyword from label, `true` by default
